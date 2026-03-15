const DEFAULT_IMAGE_MODEL = 'gemini-nano-banana';

type GenerateLookInput = {
  outfitName: string;
  sourceImageBase64: string;
  sourceImageMimeType: string;
  productImageBase64?: string;
  productImageMimeType?: string;
};

type GenerateLookOutput = {
  note: string;
  generatedImageBase64?: string;
  generatedImageMimeType: string;
};

export async function generateLookWithGemini(
  input: GenerateLookInput
): Promise<GenerateLookOutput> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('Missing EXPO_PUBLIC_GEMINI_API_KEY. Add it to your environment first.');
  }

  const configuredModel = process.env.EXPO_PUBLIC_GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const modelCandidates = uniqueModels([
    configuredModel,
    'gemini-2.0-flash-preview-image-generation',
    DEFAULT_IMAGE_MODEL,
  ]);

  const imagePrompt = [
    'You are an AI fashion editor for a mobile app.',
    'Take the provided user photo and apply the selected outfit concept.',
    `Selected outfit: ${input.outfitName}.`,
    'Preserve the same person identity and pose.',
    'Return one edited photoreal image and one short sentence (max 25 words).',
  ].join(' ');

  let lastError = '';
  let fallbackNote = '';

  for (const model of modelCandidates) {
    const imageResult = await callGeminiModel(
      apiKey,
      model,
      buildImagePayload(input, imagePrompt, true)
    );

    let response = imageResult.response;
    let ok = imageResult.ok;

    // Some models reject responseModalities but still support image output without it.
    if (!ok) {
      const body = await readErrorBody(response);
      const mentionsModalities = /responseModalities|response_modalities/i.test(body);
      if (mentionsModalities) {
        const retryResult = await callGeminiModel(
          apiKey,
          model,
          buildImagePayload(input, imagePrompt, false)
        );
        response = retryResult.response;
        ok = retryResult.ok;
        if (!ok) {
          lastError = await readErrorBody(response);
          continue;
        }
      } else {
        lastError = body;
        continue;
      }
    }

    const parsed = await parseGeminiResponse(response);
    if (parsed.generatedImageBase64) {
      return {
        note: parsed.note || 'Look generated with Gemini.',
        generatedImageBase64: parsed.generatedImageBase64,
        generatedImageMimeType: parsed.generatedImageMimeType || 'image/png',
      };
    }

    if (parsed.note && !fallbackNote) {
      fallbackNote = parsed.note;
    }
  }

  if (fallbackNote) {
    return {
      note: fallbackNote,
      generatedImageMimeType: 'image/png',
    };
  }

  fallbackNote = await tryGenerateTextNote(apiKey, configuredModel, input.outfitName);
  if (fallbackNote) {
    return {
      note: fallbackNote,
      generatedImageMimeType: 'image/png',
    };
  }

  throw new Error(
    `Gemini did not return an image payload. ${lastError || 'Use an image-generation capable model in EXPO_PUBLIC_GEMINI_IMAGE_MODEL.'}`
  );
}

function buildImagePayload(
  input: GenerateLookInput,
  imagePrompt: string,
  includeResponseModalities: boolean
) {
  return {
    contents: [
      {
        role: 'user',
        parts: buildImageParts(input, imagePrompt),
      },
    ],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 120,
      ...(includeResponseModalities ? { responseModalities: ['TEXT', 'IMAGE'] } : {}),
    },
  };
}

function uniqueModels(models: string[]): string[] {
  return [...new Set(models.map((item) => item.trim()).filter(Boolean))];
}

async function tryGenerateTextNote(
  apiKey: string,
  model: string,
  outfitName: string
): Promise<string> {
  const noteResult = await callGeminiModel(apiKey, model, {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Write one short style result sentence (max 20 words) for this outfit: ${outfitName}.`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 60,
    },
  });

  if (!noteResult.ok) {
    return '';
  }

  const parsed = await parseGeminiResponse(noteResult.response);
  return parsed.note || '';
}

function buildImageParts(input: GenerateLookInput, imagePrompt: string) {
  const parts: Array<{
    text?: string;
    inline_data?: {
      mime_type: string;
      data: string;
    };
  }> = [
    { text: imagePrompt },
    {
      inline_data: {
        mime_type: input.sourceImageMimeType,
        data: input.sourceImageBase64,
      },
    },
  ];

  if (input.productImageBase64 && input.productImageMimeType) {
    parts.push({
      inline_data: {
        mime_type: input.productImageMimeType,
        data: input.productImageBase64,
      },
    });
  }

  return parts;
}

async function callGeminiModel(
  apiKey: string,
  model: string,
  payload: unknown
): Promise<{ ok: boolean; response: Response }> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return {
    ok: response.ok,
    response,
  };
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const body = await response.text();
    return body.slice(0, 300);
  } catch {
    return '';
  }
}

async function parseGeminiResponse(response: Response): Promise<{
  note?: string;
  generatedImageBase64?: string;
  generatedImageMimeType?: string;
}> {
  const data = (await response.json()) as GeminiGenerateResponse;
  const parts = data.candidates?.[0]?.content?.parts || [];

  let note = '';
  let generatedImageBase64 = '';
  let generatedImageMimeType = '';

  for (const part of parts) {
    if (!note && part.text?.trim()) {
      note = part.text.trim();
    }

    const inlineData = part.inlineData || part.inline_data;
    if (!generatedImageBase64 && inlineData?.data) {
      generatedImageBase64 = inlineData.data;
      generatedImageMimeType =
        ('mimeType' in inlineData ? inlineData.mimeType : undefined) ||
        ('mime_type' in inlineData ? inlineData.mime_type : undefined) ||
        'image/png';
    }
  }

  return {
    note,
    generatedImageBase64,
    generatedImageMimeType,
  };
}

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
        inline_data?: {
          mime_type?: string;
          data?: string;
        };
      }>;
    };
  }>;
};
