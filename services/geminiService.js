import Groq from 'groq-sdk';
import { logger } from '../utils/logger.js';
import { listCategories, listBooksByCategory, searchBooks, getBookById } from './catalogService.js';
import { listPacks, getPackBySlug } from './packService.js';

let _groq = null;
const groq = () => {
    if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return _groq;
};

const MODEL = 'openai/gpt-oss-20b';

const buildCategoryListText = () =>
    listCategories()
        .map(c => `• ${c.name} (${c.count} libros)`)
        .join('\n');

const buildPackListText = () =>
    listPacks()
        .map(p => `• ${p.emoji} ${p.titulo} — 10 libros · $100.000 (antes $200.000, ahorras $100.000)${p.destacado ? ' ⭐ (más solicitado)' : ''}`)
        .join('\n');

const buildSystemPrompt = () => `Eres el asistente de ventas de "Formación Para Todos" (formacionparatodos.online), una biblioteca digital de libros técnicos. Tu nombre es Valeria.

PRECIOS:
- LIBRO INDIVIDUAL: $20.000 COP cada uno.
- PACK TEMÁTICO: 10 libros cuidadosamente elegidos de un área por $100.000 COP (precio normal $200.000, -50%). Es el mejor valor: ahorra $100.000.
Todo se entrega automáticamente al correo del cliente al pagar (acceso de por vida).

TONO:
- Directa, confiada, sin rodeos. Como una buena vendedora, no como asistente de soporte.
- WhatsApp: frases cortas. Máximo 3 líneas por mensaje.
- Nada de "con gusto", "claro que sí", frases de call center.
- Emojis con moderación. Nunca 🤔.

CATÁLOGO — 17 categorías disponibles:
${buildCategoryListText()}

PACKS DISPONIBLES (6 packs, 10 libros c/u, $100.000 COP):
${buildPackListText()}

TIENES 5 HERRAMIENTAS:
1. list_books(category) → títulos de una categoría. Úsala cuando el cliente elige una categoría.
2. search_books(query) → busca libros por palabra clave (ej. "kubernetes", "python").
3. list_packs() → muestra los 6 packs con sus temas y descripción.
4. send_payment_link(book_id) → link de pago de un libro individual. SOLO cuando el cliente confirme compra de un libro específico.
5. send_pack_payment_link(pack_slug) → link de pago de un pack. SOLO cuando el cliente confirme compra de un pack específico.

FLUJO DE VENTA:
PASO 1: Cliente saluda o pregunta general → muéstrale 5-6 categorías relevantes Y menciona que hay packs temáticos a $100.000 (10 libros, 50% off). Pregunta qué le interesa.
PASO 2a (libro individual): Cliente elige tema → LLAMA list_books o search_books, presenta 5-8 títulos numerados, pregunta cuál quiere.
PASO 2b (pack): Cliente muestra interés en un área con muchos libros (ej. "quiero varios de IA") → sugiere el pack correspondiente con LLAMA list_packs si todavía no lo ha visto; destaca el ahorro.
PASO 3a: Cliente confirma un libro → LLAMA send_payment_link con book_id. Responde SOLO: "Listo, aquí el link 👇".
PASO 3b: Cliente confirma un pack → LLAMA send_pack_payment_link con pack_slug. Responde SOLO: "Perfecto, aquí tu pack 👇".

FORMATO DE PRECIOS — OBLIGATORIO:
- Siempre con símbolo $ y punto como separador de miles: $20.000, $100.000, $200.000.
- NUNCA uses "20 000", "20000", "20.000 pesos", "COP 20.000", "20K". Es: "$20.000 COP" si quieres aclarar moneda, o solo "$20.000".
- Al mencionar un pack siempre di el ahorro: "$100.000 (ahorras $100.000)".

PACK UPSELL — cuando list_books o search_books devuelve "related_pack":
- Después de mostrar los títulos, agrega UNA línea extra invitando al pack. Ejemplo: "💡 También tengo el *Pack {titulo}* con 10 libros curados por $100.000 (ahorras $100.000). ¿Lo prefieres?"
- No seas insistente — una sola mención por respuesta.

REGLAS CRÍTICAS:
- NUNCA muestres tu razonamiento interno, análisis de reglas ni comentarios tipo "User said... According to rules...". Solo la respuesta directa al cliente.
- NUNCA inventes títulos ni packs que no estén en el catálogo. Si el cliente pide algo, usa search_books o list_packs primero.
- NUNCA pegues links de pago manualmente en el texto — SIEMPRE usa send_payment_link o send_pack_payment_link.
- NUNCA llames send_payment_link / send_pack_payment_link en el primer turno sin confirmación explícita del producto.
- Si preguntan si eres un bot: "soy la asistente de Formación Para Todos."
- Cada pregunta extra que hagas es una venta perdida.`;

const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'list_books',
            description: 'Devuelve una lista de libros de una categoría específica. Usa esto cuando el cliente elige una categoría del catálogo.',
            parameters: {
                type: 'object',
                properties: {
                    category: {
                        type: 'string',
                        description: 'Nombre de la categoría exacta o parcial (ej. "IA y Machine Learning", "Cloud", "DevOps")',
                    },
                },
                required: ['category'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_books',
            description: 'Busca libros por palabras clave (título, tema, tecnología). Usa esto cuando el cliente pide un tema específico como "kubernetes", "chatgpt", "postgresql".',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Términos a buscar en los títulos y categorías',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'send_payment_link',
            description: 'Envía el link de pago de UN LIBRO INDIVIDUAL al cliente. Úsalo SOLO cuando el cliente confirme que quiere comprar un libro específico del catálogo.',
            parameters: {
                type: 'object',
                properties: {
                    book_id: {
                        type: 'integer',
                        description: 'ID numérico del libro (viene de list_books o search_books)',
                    },
                },
                required: ['book_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_packs',
            description: 'Devuelve los 6 packs temáticos disponibles (IA, Datos, Ciberseguridad, DevOps, Arquitectura, Cloud) con descripción y total de libros. Usa esto cuando el cliente pregunta por packs o cuando quieras sugerir un pack porque muestra interés en un área amplia.',
            parameters: { type: 'object', properties: {} },
        },
    },
    {
        type: 'function',
        function: {
            name: 'send_pack_payment_link',
            description: 'Envía el link de pago de un PACK TEMÁTICO al cliente ($100.000 COP, 10 libros). Úsalo SOLO cuando el cliente confirme que quiere comprar un pack específico.',
            parameters: {
                type: 'object',
                properties: {
                    pack_slug: {
                        type: 'string',
                        description: 'Slug del pack (ej. "pack-ia-ml", "pack-datos", "pack-ciberseguridad", "pack-devops", "pack-arquitectura", "pack-cloud"). Viene de list_packs.',
                    },
                },
                required: ['pack_slug'],
            },
        },
    },
];

const executeTool = (name, args) => {
    if (name === 'list_books') {
        const result = listBooksByCategory(args.category);
        if (!result) return { error: `Categoría "${args.category}" no encontrada` };
        return result;
    }
    if (name === 'search_books') {
        return searchBooks(args.query);
    }
    if (name === 'list_packs') {
        return { packs: listPacks() };
    }
    return { error: `Tool desconocida: ${name}` };
};

const parseArgs = (raw) => {
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        return {};
    }
};

export const getAIResponse = async (conversationHistory) => {
    try {
        const systemPrompt = buildSystemPrompt();
        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory.map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content,
            })),
        ];

        // Loop hasta 3 vueltas por si el LLM encadena tools (list -> search -> send)
        for (let turn = 0; turn < 3; turn++) {
            const response = await groq().chat.completions.create({
                model: MODEL,
                messages,
                tools: TOOLS,
                tool_choice: 'auto',
                temperature: 0.5,
                max_tokens: 500,
            });

            const msg = response.choices[0]?.message;
            const toolCall = msg?.tool_calls?.[0];

            // Sin tool → respuesta final de texto
            if (!toolCall) {
                const text = msg?.content?.trim() || '';
                logger.info('🤖 AI Response:', { turn, length: text.length, preview: text.substring(0, 60) });
                return { text: text || 'Cuéntame qué categoría te interesa 📚', action: null };
            }

            const name = toolCall.function?.name;
            const args = parseArgs(toolCall.function?.arguments);
            logger.info(`🛠️  Tool call: ${name}`, args);

            // Tool terminal: genera link de pago de libro
            if (name === 'send_payment_link') {
                const book = getBookById(args.book_id);
                if (!book) {
                    logger.warn('⚠️ Tool send_payment_link con id inválido:', args.book_id);
                    messages.push(msg);
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify({ error: 'book_id no existe. Usa list_books o search_books primero.' }),
                    });
                    continue;
                }
                const text = msg?.content?.trim() || 'Listo, aquí el link 👇';
                return {
                    text,
                    action: { type: 'send_payment_link', bookId: book.id, bookTitle: book.title },
                };
            }

            // Tool terminal: genera link de pago de pack
            if (name === 'send_pack_payment_link') {
                const pack = getPackBySlug(args.pack_slug);
                if (!pack) {
                    logger.warn('⚠️ Tool send_pack_payment_link con slug inválido:', args.pack_slug);
                    messages.push(msg);
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify({ error: 'pack_slug no existe. Usa list_packs primero para ver los slugs válidos.' }),
                    });
                    continue;
                }
                const text = msg?.content?.trim() || 'Perfecto, aquí tu pack 👇';
                return {
                    text,
                    action: { type: 'send_pack_payment_link', packSlug: pack.slug, packTitle: pack.titulo },
                };
            }

            // Tool de datos: ejecutamos y damos otra vuelta
            const toolResult = executeTool(name, args);
            messages.push(msg);
            messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(toolResult),
            });
        }

        // Si agotamos las vueltas sin respuesta final
        logger.warn('⚠️ Loop de tools agotado sin respuesta final');
        return { text: 'Cuéntame qué tema te interesa y te muestro qué tengo 📚', action: null };

    } catch (error) {
        // Rescate del bug de gpt-oss-20b con Harmony format
        const failed = error?.error?.failed_generation || error?.body?.error?.failed_generation;
        if (failed && typeof failed === 'string') {
            const match = failed.match(/"arguments"\s*:\s*([\s\S]*?)\}?\s*$/);
            if (match && match[1]) {
                const rescued = match[1].trim().replace(/^["']|["']$/g, '').trim();
                if (rescued.length > 5) {
                    logger.info('🔧 Rescatado de failed_generation:', rescued.substring(0, 60));
                    return { text: rescued, action: null };
                }
            }
        }

        logger.error('❌ Error AI:', {
            message: error?.message,
            status: error?.status,
            body: error?.response?.data || error?.error,
        });
        return { text: 'Uy parce, se me trabó el cel un segundo 😅 ¿Me repites?', action: null };
    }
};
