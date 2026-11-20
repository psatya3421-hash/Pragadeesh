import { type FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import type { RawAIExtraction } from '../src/lib/domainLogic';
import { ADMIN_PAYMENT_UPI_NUMBER } from '../src/lib/domainLogic';
import {
  dedupeJarvisActions,
  parseJarvisCommand,
  resolveProductMatch,
} from '../src/lib/jarvisLogic';
import type { HomeTab, JarvisAction, Product } from '../src/types';
import {
  formatStudioAiError,
  isValidStudioChatModel,
  normalizeImageAspectRatio,
  normalizeMusicModel,
  normalizeVideoAspectRatio,
} from '../src/lib/aiStudioLogic';
import {
  buildStructuredFallbackLyrics,
  buildSunoLyriaPrompt,
  extractSingableLyricsText,
  generateStudioSynthWavBase64,
} from '../src/lib/musicStudioLogic';
import {
  mixVocalAndBackingToMp3,
  transcodeAudioBase64ToMp3,
} from './audioMedia';

export function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function classifyStudioGeminiError(error: unknown): { status: number; message: string } {
  const errMsg = error instanceof Error ? error.message : String(error);
  const lower = errMsg.toLowerCase();
  if (lower.includes('permission_denied') || lower.includes('api_key_invalid') || lower.includes('403')) {
    return { status: 403, message: formatStudioAiError(errMsg, 403) };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return { status: 429, message: formatStudioAiError(errMsg, 429) };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return { status: 404, message: formatStudioAiError(errMsg, 404) };
  }
  return { status: 502, message: formatStudioAiError(errMsg, 502) };
}

export async function analyzePaymentScreenshotWithGemini(
  base64Image: string,
  mimeType: string,
  expectedAmount: number,
): Promise<RawAIExtraction> {
  const ai = getAiClient();
  if (!ai) {
    return {
      extractedAmount: null,
      dateTime: null,
      status: 'unknown',
      receiverNumber: null,
      utrId: null,
      summary:
        'AI Vision service is awaiting a configured GEMINI_API_KEY. Payment has been queued for Admin Review.',
      confidence: 0,
    };
  }

  const cleanBase64 = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `Analyze this UPI / GPay / PhonePe / bank payment screenshot carefully.
Expected payment amount: INR ${expectedAmount}.
Expected receiver mobile/UPI number: ${ADMIN_PAYMENT_UPI_NUMBER}.
Extract:
1. extractedAmount (number or null if unreadable)
2. dateTime (string timestamp shown on screenshot or null)
3. status ('success', 'failed', or 'unknown')
4. receiverNumber (the receiver mobile number, UPI ID, or masked number shown, or null)
5. utrId (the UPI Reference ID / UTR / Transaction ID string, or null)
6. summary (a concise 1-sentence human explanation of what the screenshot shows)
7. confidence (number between 0 and 1 representing visual clarity and certainty).`,
          },
        ],
      },
      config: {
        systemInstruction:
          'You are a strict financial payment verification parser for PRIME X INNOVATION. Never guess numbers that are blurry or absent. Return strict JSON matching the schema.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            extractedAmount: { type: Type.NUMBER, nullable: true },
            dateTime: { type: Type.STRING, nullable: true },
            status: { type: Type.STRING, enum: ['success', 'failed', 'unknown'] },
            receiverNumber: { type: Type.STRING, nullable: true },
            utrId: { type: Type.STRING, nullable: true },
            summary: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
          },
          required: ['status', 'summary', 'confidence'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<RawAIExtraction>;
    return {
      extractedAmount:
        typeof parsed.extractedAmount === 'number' && Number.isFinite(parsed.extractedAmount)
          ? parsed.extractedAmount
          : null,
      dateTime: parsed.dateTime ?? null,
      status:
        parsed.status === 'success' || parsed.status === 'failed'
          ? parsed.status
          : 'unknown',
      receiverNumber: parsed.receiverNumber ?? null,
      utrId: parsed.utrId ?? null,
      summary: parsed.summary || 'Screenshot analyzed by Gemini Vision.',
      confidence:
        typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      extractedAmount: null,
      dateTime: null,
      status: 'unknown',
      receiverNumber: null,
      utrId: null,
      summary: `AI analysis could not complete (${errMsg.slice(0, 120)}). Queued for Admin Review.`,
      confidence: 0,
    };
  }
}

export interface AssistantChatContext {
  activeTab?: string;
  cartCount?: number;
  cartSubtotal?: number;
  productsCount?: number;
  products?: Product[];
  productsSummary?: string;
  customQuotesSummary?: string;
  coursesCount?: number;
  recentWarnings?: string[];
  userName?: string;
}

const JARVIS_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'navigate_tab',
    description:
      'Navigate the PRIME X INNOVATION portal to a specific main section tab (projects store, video studio, music studio, game studio, or live classes).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tab: {
          type: Type.STRING,
          description:
            'Target tab ID: "projects" (PRIME X PROJECTS / store), "studio" (PRIME X STUDIO video editor), "music" (MUSIC STUDIO), "games" (GAME STUDIO), or "classes" (LIVE CLASSES).',
        },
      },
      required: ['tab'],
    },
  },
  {
    name: 'set_store_view',
    description:
      'Switch the active sub-view inside PRIME X PROJECTS store between catalog, cart, and orders/bills.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        subView: {
          type: Type.STRING,
          description: 'Sub-view name: "catalog", "cart", or "orders".',
        },
      },
      required: ['subView'],
    },
  },
  {
    name: 'filter_catalog',
    description:
      'Filter or search the PRIME X PROJECTS catalog by product name keyword or category.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        searchQuery: {
          type: Type.STRING,
          description: 'Search text matching product name, category, or description.',
        },
        category: {
          type: Type.STRING,
          description: 'Optional category name such as "Robotics Kits", "Web Solutions", "Custom Ideas", or "All".',
        },
      },
    },
  },
  {
    name: 'clear_catalog_filters',
    description: 'Reset catalog search text and category filters back to showing all products.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'order_product',
    description:
      'Order or add a catalog product (e.g. Human Follower, Obstacle Avoiding Kit, Webpages for Company, Other Ideas) to the user cart, and open the cart or custom quote form.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        productQuery: {
          type: Type.STRING,
          description: 'Product name or spoken phrase such as "Human Follower" or "Obstacle Avoiding Kit".',
        },
        quantity: {
          type: Type.NUMBER,
          description: 'Quantity to add (defaults to 1).',
        },
        openCart: {
          type: Type.BOOLEAN,
          description: 'Whether to switch to the Cart view after adding standard kits (default true).',
        },
        openCheckout: {
          type: Type.BOOLEAN,
          description: 'Whether to immediately open the Delivery Address & Billing modal after adding (default false unless user asked to checkout/pay/bill now).',
        },
      },
      required: ['productQuery'],
    },
  },
  {
    name: 'open_address_checkout',
    description: 'Open the Delivery Address & Billing checkout flow for items already in the cart.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
];

function mapFunctionCallsToJarvisActions(
  functionCalls: { name?: string; args?: Record<string, unknown> }[] | undefined,
  products: Product[],
): JarvisAction[] {
  if (!Array.isArray(functionCalls) || functionCalls.length === 0) return [];
  const actions: JarvisAction[] = [];

  for (const call of functionCalls) {
    const args = call.args || {};
    if (call.name === 'navigate_tab') {
      const rawTab = String(args.tab || '').toLowerCase() as HomeTab;
      if (['projects', 'studio', 'music', 'games', 'classes'].includes(rawTab)) {
        actions.push({ type: 'navigate_tab', tab: rawTab });
      }
    } else if (call.name === 'set_store_view') {
      const sv = String(args.subView || '').toLowerCase();
      if (sv === 'catalog' || sv === 'cart' || sv === 'orders') {
        actions.push({ type: 'set_store_view', subView: sv });
      }
    } else if (call.name === 'filter_catalog') {
      actions.push({
        type: 'filter_catalog',
        searchQuery: typeof args.searchQuery === 'string' ? args.searchQuery : undefined,
        category: typeof args.category === 'string' ? args.category : undefined,
      });
    } else if (call.name === 'clear_catalog_filters') {
      actions.push({ type: 'clear_catalog_filters' });
    } else if (call.name === 'order_product') {
      const rawQuery = String(args.productQuery || '').trim();
      const matched = resolveProductMatch(products, rawQuery);
      const qtyRaw = Number(args.quantity ?? 1);
      const quantity = Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.min(20, Math.round(qtyRaw)) : 1;
      if (rawQuery) {
        actions.push({
          type: 'order_product',
          productQuery: matched?.name || rawQuery,
          quantity,
          openCart: args.openCart !== false,
          openCheckout: args.openCheckout === true,
        });
      }
    } else if (call.name === 'open_address_checkout') {
      actions.push({ type: 'open_address_checkout' });
    }
  }

  return actions;
}

function buildSmartPrimeXFallbackReply(
  userMessage: string,
  context: AssistantChatContext,
): string {
  const q = userMessage.toLowerCase();

  if (q.includes('obstacle') || q.includes('human follower') || q.includes('kit') || q.includes('product') || q.includes('price') || q.includes('catalog')) {
    return `In PRIME X PROJECTS, we offer: Obstacle Avoiding Kit (4 Wheel Chassis) at ₹2,999, Human Follower (4 Wheel Chassis) at ₹2,499, Webpages for Company starting at ₹3,999 per page, and Other Ideas (custom quote).${context.productsSummary ? ` Current catalog items: ${context.productsSummary}.` : ''} Standard kits can be added straight to Cart, while Webpages and Other Ideas let you submit your project details first before billing.`;
  }

  if (q.includes('webpage') || q.includes('web page') || q.includes('website') || q.includes('other idea') || q.includes('quote') || q.includes('theme') || q.includes('sample')) {
    return `When you select Webpages for Company (₹3,999/page), you fill in your compulsory contact number, webpage description, and background theme (sample webpage link is optional). For Other Ideas, you enter your project details. Your details are sent straight to the Admin Portal — please wait 1 day (24 hours) for the admin to enter your exact personalized amount, which then unlocks exclusively on your account to review and pay.`;
  }

  if (q.includes('address') || q.includes('map') || q.includes('location') || q.includes('delivery')) {
    return 'When checking out or billing a custom quote in PRIME X PROJECTS, use the Google Maps Delivery Locator to search or pin your address, save it to your address book, and select a confirmed delivery address before proceeding to payment and bill generation.';
  }

  if (q.includes('music') || q.includes('suno') || q.includes('lyria') || q.includes('song')) {
    return 'Open the MUSIC STUDIO tab to compose songs: switch between Simple and Custom Lyrics modes, add [Verse], [Chorus], and [Bridge] tags, speak lyrics directly with Voice Input, compose tracks that sing your lyrics, send them to the CapCut timeline, or download in MP3 format.';
  }

  if (q.includes('game') || q.includes('download') || q.includes('10')) {
    return 'In the GAME STUDIO tab, customize your own arcade game title, world theme, weapon ability, hero speed, difficulty, and win score, then play it live in the browser! To download the standalone playable HTML5 game bundle for offline play, complete the ₹10 UPI download payment.';
  }

  if (q.includes('upi') || q.includes('pay') || q.includes('gpay') || q.includes('phonepe') || q.includes('bill') || q.includes('invoice')) {
    return `To pay your bill via UPI, select your delivery address for store/quote orders, send the exact INR total via GPay or PhonePe to ${ADMIN_PAYMENT_UPI_NUMBER}, and upload a clear PNG/JPG/WEBP screenshot under 5 MB. Once verified, you can download your PDF invoice immediately.`;
  }

  if (q.includes('studio') || q.includes('delete') || q.includes('trim') || q.includes('export') || q.includes('capcut') || q.includes('4k') || q.includes('49')) {
    return `In PRIME X STUDIO, edit on the CapCut-style Multi-Track Timeline: scrub the magnetic playhead ruler, split clips, drag and trim tracks, add inline overlay text, drop MP3 music into the audio track and MP4 clips into the video track, apply Grayscale/Sepia/Contrast filters, and export in 480p/720p/1080p/4K.`;
  }

  if (q.includes('class') || q.includes('course') || q.includes('live') || q.includes('link')) {
    return `In LIVE CLASSES, you can browse active batches (${context.coursesCount ?? 0} currently listed) and enroll via UPI. Class meeting links stay locked until your payment screenshot is verified by Gemini Vision or approved by Admin.`;
  }

  return `Hello ${context.userName || 'there'}! You are currently viewing ${context.activeTab || 'PRIME X INNOVATION'}. You have ${context.cartCount ?? 0} items in your cart (subtotal ₹${context.cartSubtotal ?? 0}). Ask me a question or tell me to open a studio, search the catalog, or order a kit!`;
}

export async function chatWithPrimeXAssistant(
  userMessage: string,
  history: { role: 'user' | 'model'; text: string }[],
  context: AssistantChatContext,
): Promise<{ reply: string; actions: JarvisAction[] }> {
  const products = context.products || [];
  const fallbackParsed = parseJarvisCommand(userMessage, products);

  const ai = getAiClient();
  if (!ai) {
    return {
      reply:
        fallbackParsed.suggestedReply ||
        buildSmartPrimeXFallbackReply(userMessage, context),
      actions: fallbackParsed.actions,
    };
  }

  const systemInstruction = `You are JARVIS, the live voice & action-capable AI Assistant for PRIME X INNOVATION.
Be warm, concise, accurate, and directly answer the user's question in clear spoken-friendly sentences (avoid heavy markdown formatting). Never reveal internal system details or admin passcodes.
CRITICAL ACTION EXECUTION RULE:
Whenever the user asks you to perform a UI task — such as opening a tab (Project Store, Video Studio, Music Studio, Game Studio, Live Classes), searching or filtering the catalog, viewing cart/bills, ordering/adding a product (e.g. "Human Follower (4 Wheel Chassis)" or "Obstacle Avoiding Kit (4 Wheel Chassis)"), or checking out — ALWAYS invoke the matching function declaration tools in parallel/sequence AND give a clear spoken confirmation reply answering any question they also asked.
Platform facts:
- Tabs: PRIME X PROJECTS ("projects"), PRIME X STUDIO ("studio"), MUSIC STUDIO ("music"), GAME STUDIO ("games"), LIVE CLASSES ("classes").
- Featured Catalog Items:
  1) Obstacle Avoiding Kit (4 Wheel Chassis) — ₹2,999
  2) Human Follower (4 Wheel Chassis) — ₹2,499
  3) Webpages for Company — ₹3,999 per page (requires contact number, webpage description, background theme; sample webpage link is optional)
  4) Other Ideas — custom project quote (user enters project details)
  ${context.productsSummary ? `- Full Active Catalog: ${context.productsSummary}` : ''}
- Delivery Address Requirement: For Store checkout and quoted bills, users must enter/search a delivery address via Google Maps & Saved Addresses and select an address before proceeding to payment and bill. Only deliverable to Tamil Nadu; projects manufactured at Coimbatore.
- Payment flow: Customers pay the exact INR (₹) total via GPay / PhonePe / any UPI app to ${ADMIN_PAYMENT_UPI_NUMBER}, then upload a clear PNG/JPG/WEBP screenshot (max 5 MB).
- Music Studio: Users compose songs with Simple or Custom Lyrics ([Verse], [Chorus], [Bridge], [Drop]), Voice Input dictation, style/genre chips, mood, BPM, vocal style, Instrumental mode, Lyria 3 models, Remix/Extend, sung lyrics playback, and MP3 download.
- Game Studio: Users customize Title, World Theme, Hero Ability, Difficulty, Speed, and Target Score, play on canvas, and pay ₹10 via UPI to unlock downloading the playable standalone HTML5 game file.
- Studio Editor tips: Features a CapCut-style Multi-Track Timeline with magnetic playhead ruler, split at playhead, delete clip, Overlay text typing, MP3 -> Audio track, MP4 -> Video track, AI Media Lab (Nano Banana 2.1, OmniFlash, Lyria 3), and MP4/WebM/MOV export.
- Live Classes rule: Meeting links remain strictly locked until payment is verified or approved.
Current user context:
- User: ${context.userName || 'Guest'}
- Active Tab: ${context.activeTab || 'Home'}
- Cart items: ${context.cartCount ?? 0} (Subtotal: ₹${context.cartSubtotal ?? 0})
- Catalog products available: ${context.productsCount ?? 0}
- User Custom Quote Requests: ${context.customQuotesSummary || 'None'}
- Active live courses: ${context.coursesCount ?? 0}
- Active warnings detected: ${(context.recentWarnings && context.recentWarnings.length > 0) ? context.recentWarnings.join('; ') : 'None'}`;

  try {
    const chat = ai.chats.create({
      model: 'gemini-4-hydrogen',
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: JARVIS_FUNCTION_DECLARATIONS }],
      },
      history: history.slice(-10).map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      })),
    });

    const response = await chat.sendMessage({ message: userMessage });
    const modelActions = mapFunctionCallsToJarvisActions(
      response.functionCalls as { name?: string; args?: Record<string, unknown> }[] | undefined,
      products,
    );
    const mergedActions = dedupeJarvisActions(
      modelActions.length > 0 ? modelActions : fallbackParsed.actions,
    );

    let replyText = (response.text ?? '').trim();

    const previousContent = response.candidates?.[0]?.content;
    if (!replyText && modelActions.length > 0 && previousContent && response.functionCalls?.length) {
      try {
        const followup = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [
            ...history.slice(-6).map((msg) => ({
              role: msg.role,
              parts: [{ text: msg.text }],
            })),
            { role: 'user', parts: [{ text: userMessage }] },
            previousContent,
            {
              role: 'user',
              parts: response.functionCalls.map((fc) => ({
                functionResponse: {
                  id: fc.id,
                  name: fc.name || 'action',
                  response: { executed: true },
                },
              })),
            },
          ],
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: JARVIS_FUNCTION_DECLARATIONS }],
          },
        });
        replyText = (followup.text ?? '').trim();
      } catch {
        // Fallback below handles spoken confirmation cleanly
      }
    }

    if (!replyText) {
      replyText =
        fallbackParsed.suggestedReply ||
        buildSmartPrimeXFallbackReply(userMessage, context);
    }

    return {
      reply: replyText,
      actions: mergedActions,
    };
  } catch {
    return {
      reply:
        fallbackParsed.suggestedReply ||
        buildSmartPrimeXFallbackReply(userMessage, context),
      actions: fallbackParsed.actions,
    };
  }
}

// ==================== PRIME X STUDIO AI CAPABILITIES ====================

async function synthesizeTtsVocalWavBase64(
  ai: GoogleGenAI,
  singableText: string,
  vocalStyle: string,
  bpm: number,
): Promise<string | null> {
  if (!singableText) return null;
  const voiceMap: Record<string, 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr'> = {
    'Airy Female Vocal': 'Zephyr',
    'Warm Male Baritone': 'Charon',
    'Dual Harmony': 'Kore',
    'Choir Anthem': 'Fenrir',
    'Melodic Vocal': 'Puck',
  };
  const prebuiltVoice = voiceMap[vocalStyle] || 'Kore';

  try {
    const ttsRes = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: singableText.slice(0, 500),
              speechMetadata: {
                style: `Melodic singing voice performative cadence at ${bpm} BPM, clear expressive ${vocalStyle} phrasing`,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: prebuiltVoice },
          },
        },
      },
    });

    for (const part of ttsRes.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return part.inlineData.data;
      }
    }
  } catch {
    // Fallback gracefully to studio vocal formant synth mix
  }
  return null;
}

export async function generateStudioMusic(params: {
  prompt: string;
  model?: string;
  imageBase64?: string;
  imageMimeType?: string;
  mode?: 'simple' | 'custom';
  title?: string;
  lyrics?: string;
  styles?: string[];
  mood?: string;
  vocalStyle?: string;
  bpm?: number;
  instrumental?: boolean;
}): Promise<{
  audioBase64: string;
  mimeType: string;
  lyrics: string;
  model: string;
  durationSeconds: number;
  engine: 'lyria-3' | 'synth-preview';
  engineNote?: string;
}> {
  const model = normalizeMusicModel(params.model);
  const styles = Array.isArray(params.styles) ? params.styles : [];
  const bpm = Math.max(60, Math.min(180, Math.round(Number(params.bpm || 118))));
  const resolvedLyrics = buildStructuredFallbackLyrics({
    mode: params.mode === 'custom' ? 'custom' : 'simple',
    title: params.title,
    prompt: params.prompt,
    lyrics: params.lyrics,
    styles,
    mood: params.mood,
    vocalStyle: params.vocalStyle,
    bpm,
    instrumental: params.instrumental,
  });

  const fullPrompt = buildSunoLyriaPrompt({
    mode: params.mode === 'custom' ? 'custom' : 'simple',
    title: params.title,
    prompt: params.prompt,
    lyrics: resolvedLyrics,
    styles,
    mood: params.mood,
    vocalStyle: params.vocalStyle,
    bpm,
    instrumental: params.instrumental,
  });

  const ai = getAiClient();
  if (ai) {
    try {
      const cleanImage = params.imageBase64?.includes(',')
        ? params.imageBase64.split(',')[1]
        : params.imageBase64;

      const contents = cleanImage
        ? {
            parts: [
              { text: fullPrompt },
              {
                inlineData: {
                  data: cleanImage,
                  mimeType: params.imageMimeType || 'image/png',
                },
              },
            ],
          }
        : fullPrompt;

      // Omit responseModalities so Lyria 3 returns both audio chunks AND generated lyrics/notes
      const response = await ai.models.generateContentStream({
        model,
        contents,
      });

      const audioBuffers: Buffer[] = [];
      let lyrics = '';
      let mimeType = 'audio/mpeg';

      for await (const chunk of response) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;
        for (const part of parts) {
          if (part.inlineData?.data) {
            if (audioBuffers.length === 0 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioBuffers.push(Buffer.from(part.inlineData.data, 'base64'));
          }
          if (part.text) {
            lyrics += part.text;
          }
        }
      }

      if (audioBuffers.length > 0) {
        const rawBase64 = Buffer.concat(audioBuffers).toString('base64');
        const mp3 = await transcodeAudioBase64ToMp3(rawBase64, mimeType);
        const finalLyrics = lyrics.trim() || resolvedLyrics;
        return {
          audioBase64: mp3.audioBase64,
          mimeType: mp3.mimeType,
          lyrics: finalLyrics,
          model,
          durationSeconds: model === 'lyria-3-pro-preview' ? 60 : 30,
          engine: 'lyria-3',
        };
      }
    } catch {
      // Fall through to TTS Vocal Mix / Formant Synth Engine below
    }
  }

  const singableText = params.instrumental ? '' : extractSingableLyricsText(resolvedLyrics);
  const synth = generateStudioSynthWavBase64({
    bpm,
    styles,
    model,
    seedText: `${params.title || ''}:${params.prompt}`,
    lyrics: resolvedLyrics,
    instrumental: Boolean(params.instrumental),
  });

  if (ai && !params.instrumental && singableText) {
    const vocalWav = await synthesizeTtsVocalWavBase64(
      ai,
      singableText,
      params.vocalStyle || 'Melodic Vocal',
      bpm,
    );
    if (vocalWav) {
      const mixedMp3 = await mixVocalAndBackingToMp3({
        backingWavBase64: synth.audioBase64,
        vocalWavBase64: vocalWav,
      });
      return {
        audioBase64: mixedMp3.audioBase64,
        mimeType: mixedMp3.mimeType,
        lyrics: resolvedLyrics,
        model,
        durationSeconds: synth.durationSeconds,
        engine: 'synth-preview',
        engineNote:
          'Sung vocal performance + studio instrumental backing mixed to downloadable MP3 (192kbps).',
      };
    }
  }

  const synthMp3 = await transcodeAudioBase64ToMp3(synth.audioBase64, synth.mimeType);
  return {
    audioBase64: synthMp3.audioBase64,
    mimeType: synthMp3.mimeType,
    lyrics: resolvedLyrics,
    model,
    durationSeconds: synth.durationSeconds,
    engine: 'synth-preview',
    engineNote: params.instrumental
      ? 'Instrumental stereo master exported as MP3 (192kbps).'
      : 'Lyric-synced formant lead & studio arrangement exported as MP3 (with live vocal lyric playback enabled).',
  };
}

export async function generateOrEditStudioImage(params: {
  prompt: string;
  imageBase64?: string;
  imageMimeType?: string;
  aspectRatio?: string;
  imageSize?: '1K' | '2K' | '4K';
  enableWebSearch?: boolean;
}): Promise<{ imageBase64: string; mimeType: string; text: string; interactionId?: string }> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
  }

  const aspectRatio = normalizeImageAspectRatio(params.aspectRatio);
  const imageSize =
    params.imageSize === '2K' || params.imageSize === '4K' ? params.imageSize : '1K';
  const cleanImage = params.imageBase64?.includes(',')
    ? params.imageBase64.split(',')[1]
    : params.imageBase64;
  const imgMime = params.imageMimeType || 'image/png';

  const input = cleanImage
    ? [
        {
          type: 'image' as const,
          data: cleanImage,
          mime_type: imgMime,
        },
        {
          type: 'text' as const,
          text: params.prompt,
        },
      ]
    : params.prompt;

  let imageBase64 = '';
  let mimeType = 'image/png';
  let text = '';
  let interactionId: string | undefined;

  try {
    const interaction = await ai.interactions.create({
      model: 'gemini-nano-banana-2.1',
      input,
      response_modalities: ['image', 'text'],
      generation_config: {
        image_config: {
          aspect_ratio: aspectRatio,
          image_size: imageSize,
        },
      },
    });
    interactionId = interaction.id;

    const steps = Array.isArray(interaction.steps) ? interaction.steps : [];
    for (const step of steps) {
      if (step.type === 'model_output' && Array.isArray(step.content)) {
        for (const item of step.content) {
          const c = item as { type?: string; data?: string; mime_type?: string; text?: string };
          if (c.type === 'image' && c.data) {
            imageBase64 = c.data;
            if (c.mime_type) mimeType = c.mime_type;
          } else if (c.type === 'text' && c.text) {
            text += c.text;
          }
        }
      }
    }

    if (!imageBase64 && interaction.output_image?.data) {
      imageBase64 = interaction.output_image.data;
      mimeType = interaction.output_image.mime_type || mimeType;
    }
    if (!text && interaction.output_text) {
      text = interaction.output_text;
    }
  } catch (err) {
    const classified = classifyStudioGeminiError(err);
    if (classified.status === 403 || classified.status === 429) {
      throw err;
    }
  }

  // Official @google/genai fallback path for Nano Banana 2.1 via generateContent
  if (!imageBase64) {
    const parts = cleanImage
      ? [
          {
            inlineData: {
              data: cleanImage,
              mimeType: imgMime,
            },
          },
          { text: params.prompt },
        ]
      : [{ text: params.prompt }];

    const response = await ai.models.generateContent({
      model: 'gemini-nano-banana-2.1',
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio,
          imageSize,
        },
        ...(params.enableWebSearch
          ? {
              tools: [
                {
                  googleSearch: {
                    searchTypes: {
                      webSearch: {},
                      imageSearch: {},
                    },
                  },
                },
              ],
            }
          : {}),
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data && !imageBase64) {
        imageBase64 = part.inlineData.data;
        if (part.inlineData.mimeType) mimeType = part.inlineData.mimeType;
      } else if (part.text) {
        text += part.text;
      }
    }
  }

  if (!imageBase64) {
    throw new Error('Nano Banana 2.1 did not return an image output.');
  }

  return {
    imageBase64,
    mimeType,
    text: text.trim(),
    interactionId,
  };
}

export async function generateStudioVideo(params: {
  mode: 'text_to_video' | 'image_to_video' | 'video_to_video';
  prompt: string;
  imageBase64?: string;
  imageMimeType?: string;
  videoBase64?: string;
  videoMimeType?: string;
  aspectRatio?: string;
  duration?: string;
  resolution?: '360p' | '720p' | '1080p';
  previousInteractionId?: string;
}): Promise<{ videoBase64: string; mimeType: string; interactionId?: string }> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
  }

  const aspectRatio = normalizeVideoAspectRatio(params.aspectRatio);
  const duration = params.duration && /^\d+s$/.test(params.duration) ? params.duration : '5s';
  const resolution =
    params.resolution === '360p' || params.resolution === '1080p' ? params.resolution : '720p';

  const cleanImage = params.imageBase64?.includes(',')
    ? params.imageBase64.split(',')[1]
    : params.imageBase64;
  const cleanVideo = params.videoBase64?.includes(',')
    ? params.videoBase64.split(',')[1]
    : params.videoBase64;

  let input:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image'; mime_type: string; data: string }
        | { type: 'video'; mime_type: string; data: string }
      > = params.prompt;

  if (params.mode === 'image_to_video' && cleanImage) {
    input = [
      {
        type: 'image',
        mime_type: params.imageMimeType || 'image/png',
        data: cleanImage,
      },
      {
        type: 'text',
        text: params.prompt,
      },
    ];
  } else if (params.mode === 'video_to_video' && cleanVideo) {
    input = [
      {
        type: 'video',
        mime_type: params.videoMimeType || 'video/mp4',
        data: cleanVideo,
      },
      {
        type: 'text',
        text: params.prompt,
      },
    ];
  }

  const interaction = await ai.interactions.create(
    {
      model: 'gemini-omni-1.2-flash',
      input,
      ...(params.previousInteractionId
        ? { previous_interaction_id: params.previousInteractionId }
        : {}),
      background: false,
      store: true,
      stream: false,
      response_format: {
        type: 'video',
        aspect_ratio: aspectRatio,
        duration,
        resolution,
      },
    },
    { timeout: 300000 },
  );

  let videoPart = interaction.output_video;
  let videoBase64 = videoPart?.data || '';
  let mimeType = videoPart?.mime_type || 'video/mp4';

  if (!videoBase64 && Array.isArray(interaction.steps)) {
    for (const step of interaction.steps) {
      if (step.type === 'model_output' && Array.isArray(step.content)) {
        for (const c of step.content) {
          const block = c as { type?: string; data?: string; mime_type?: string; uri?: string };
          if (block.type === 'video' && (block.data || block.uri)) {
            videoPart = block as typeof videoPart;
            videoBase64 = block.data || '';
            if (block.mime_type) mimeType = block.mime_type;
          }
        }
      }
    }
  }

  if (!videoBase64 && videoPart?.uri) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    const res = await fetch(videoPart.uri, {
      headers: { 'x-goog-api-key': apiKey },
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      videoBase64 = buf.toString('base64');
    }
  }

  if (!videoBase64) {
    throw new Error('Gemini Omni Flash did not return video output.');
  }

  return {
    videoBase64,
    mimeType,
    interactionId: interaction.id,
  };
}

export async function transcribeStudioAudio(params: {
  audioBase64: string;
  mimeType: string;
  formatMode?: 'plain' | 'timestamps' | 'lyrics';
}): Promise<{ transcript: string }> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
  }

  const cleanBase64 = params.audioBase64.includes(',')
    ? params.audioBase64.split(',')[1]
    : params.audioBase64;

  const instruction =
    params.formatMode === 'timestamps'
      ? 'Transcribe this audio accurately with speaker breaks and [MM:SS] timestamp markers suitable for video subtitles.'
      : params.formatMode === 'lyrics'
        ? 'Transcribe the spoken or sung audio into clean song lyrics formatted with short lines and optional [Verse] / [Chorus] headers.'
        : 'Transcribe this audio clearly and accurately.';

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType || 'audio/webm',
            data: cleanBase64,
          },
        },
        { text: instruction },
      ],
    },
  });

  return { transcript: (response.text ?? '').trim() };
}

function buildSmartStudioFallbackReply(
  message: string,
  systemInstruction: string,
): string {
  const q = message.toLowerCase();
  if (q.includes('trailer') || q.includes('script') || q.includes('hook')) {
    return 'Here is a crisp 15-second launch trailer plan: 0 to 3 seconds open with an ultra-tight close-up macro reveal and a bold gold headline hook; 3 to 10 seconds cut to 3 dynamic feature angles synced on 120 BPM drum hits; 10 to 15 seconds pull back into your hero lockup with a clean call-to-action caption.';
  }
  if (q.includes('music') || q.includes('lyria') || q.includes('audio') || q.includes('sound')) {
    return 'Suggested music direction: 118 BPM warm analog synth arpeggios layered over a tight sub-bass pulse, crisp rimshot percussion, and a subtle metallic riser at 8 seconds for an inspiring luxury tech reveal.';
  }
  if (q.includes('light') || q.includes('shot') || q.includes('9:16') || q.includes('3d')) {
    return 'For a clean 3-point lighting setup in 9:16 vertical framing: place a soft diffused key light 45 degrees front-left, a subtle warm gold rim light behind the shoulder to separate silhouette from the navy backdrop, and a gentle low-intensity fill card on the right.';
  }
  if (q.includes('delete') || q.includes('trim') || q.includes('timeline') || q.includes('export')) {
    return 'On the Prime X Studio Multi-Track Timeline, click any clip to adjust trim start/end timestamps or click the trash button directly on any audio, video, or text clip to remove it immediately. When ready, open Export Project to download MP4 or WebM.';
  }
  const roleHint = systemInstruction.trim()
    ? 'Based on your Studio role settings: '
    : '';
  return `${roleHint}Focus on a clear visual hook in the first 3 seconds, balance contrast and color grading under Filters & Color, align audio transitions cleanly on the Multi-Track Timeline, and export in 1080p MP4 or WebM for sharpest social playback.`;
}

export async function chatWithStudioModels(params: {
  model: string;
  systemInstruction: string;
  message: string;
  history: { role: 'user' | 'model'; text: string }[];
}): Promise<{ reply: string; model: string }> {
  const chosenModel = isValidStudioChatModel(params.model) ? params.model : 'gemini-4-hydrogen';
  const ai = getAiClient();
  if (!ai) {
    return {
      reply: buildSmartStudioFallbackReply(params.message, params.systemInstruction),
      model: `${chosenModel} (studio-guide)`,
    };
  }

  const baseRole =
    params.systemInstruction.trim() ||
    'You are the Creative Studio AI Assistant for PRIME X INNOVATION. Give clear, concise, practical production answers.';
  const sysInst = `${baseRole}
Keep replies direct and easy to read or hear aloud (avoid heavy markdown headers or excessive asterisks).
When users ask about editing or using PRIME X STUDIO:
- Delete any video, image, audio, or text clip directly using the Trash button on that clip block in the Multi-Track Timeline (Video / Image, Audio / SFX, or Text / Stickers tracks), or click Delete in the Selected Clip inspector.
- Export 480p, 720p, 1080p, or 4K (₹10) in MP4 or WebM using the Export Project button at the top bar of Timeline Editor.
- CapCut Premium Edits (0.25x-4x speed, chroma/freeze FX, auto-captions) unlock via the ₹49/mo subscription.
- Notice: Live API is removed; Audio Transcribe supports Microphone and uploaded audio transcription.
- In PRIME X PROJECTS: Obstacle Avoiding Kit (4 Wheel Chassis) is ₹2,999, Human Follower (4 Wheel Chassis) is ₹2,499, Webpages for Company is ₹3,999 per page (1-day admin quote after contact/description/theme), and Other Ideas supports custom quotes.`;

  const tryChat = async (targetModel: string) => {
    const chat = ai.chats.create({
      model: targetModel,
      config: { systemInstruction: sysInst },
      history: params.history.slice(-20).map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      })),
    });
    const response = await chat.sendMessage({ message: params.message });
    return (response.text ?? '').trim();
  };

  try {
    const reply = await tryChat(chosenModel);
    if (reply) {
      return { reply, model: chosenModel };
    }
  } catch {
    if (chosenModel !== 'gemini-4-hydrogen') {
      try {
        const fallbackReply = await tryChat('gemini-4-hydrogen');
        if (fallbackReply) {
          return { reply: fallbackReply, model: 'gemini-4-hydrogen' };
        }
      } catch {
        // Fall through to deterministic studio reply
      }
    }
  }

  return {
    reply: buildSmartStudioFallbackReply(params.message, params.systemInstruction),
    model: `${chosenModel} (studio-guide)`,
  };
}

