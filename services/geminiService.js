import Groq from 'groq-sdk';
import { logger } from '../utils/logger.js';
import { listCategories, listBooksByCategory, searchBooks, getBookById } from './catalogService.js';

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

const buildSystemPrompt = () => `Eres el asistente de ventas de "Formación Para Todos" (formacionparatodos.online), una biblioteca digital de libros técnicos. Tu nombre es Valeria.

CADA LIBRO CUESTA $20.000 COP y se entrega automáticamente al correo del cliente al pagar (acceso de por vida al material).

TONO:
- Directa, confiada, sin rodeos. Como una buena vendedora, no como asistente de soporte.
- WhatsApp: frases cortas. Máximo 3 líneas por mensaje.
- Nada de "con gusto", "claro que sí", frases de call center.
- Emojis con moderación. Nunca 🤔.

CATÁLOGO — 17 categorías disponibles:
${buildCategoryListText()}

TIENES 3 HERRAMIENTAS:
1. list_books(category) → muestra los títulos de una categoría. Úsala cuando el cliente elige una categoría del listado.
2. search_books(query) → busca libros por palabra clave (ej. "kubernetes", "python", "chatgpt"). Úsala cuando el cliente pide un tema específico que no coincide con una categoría entera.
3. send_payment_link(book_id) → genera el link de pago. Úsala SOLO cuando el cliente confirme que quiere comprar un libro específico (después de que le mostraste el título).

FLUJO DE VENTA — 3 pasos:
PASO 1: Cliente saluda o pregunta general → muéstrale las categorías principales (elige 5-6 relevantes de la lista de arriba) y pregunta cuál le interesa.
PASO 2: Cliente elige categoría o tema → LLAMA list_books o search_books, presenta 5-8 títulos numerados y pregunta cuál quiere.
PASO 3: Cliente confirma un libro específico (por número o título) → LLAMA send_payment_link con el book_id correcto y responde SOLO: "Listo, aquí el link 👇".

REGLAS CRÍTICAS:
- NUNCA muestres tu razonamiento interno, análisis de reglas ni comentarios tipo "User said... According to rules...". Solo la respuesta directa al cliente.
- NUNCA inventes títulos que no estén en el catálogo. Si el cliente pide algo, usa search_books primero.
- NUNCA pegues links de pago manualmente en el texto — SIEMPRE usa send_payment_link.
- NUNCA llames send_payment_link en el primer turno sin haber mostrado el libro específico primero.
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
            description: 'Envía el link de pago Mercado Pago al cliente. Úsalo SOLO cuando el cliente confirme que quiere comprar un libro específico del catálogo.',
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
];

const executeTool = (name, args) => {
    if (name === 'list_books') {
        const result = listBooksByCategory(args.category);
        if (!result) return { error: `Categoría "${args.category}" no encontrada` };
        return result;
    }
    if (name === 'search_books') {
        const results = searchBooks(args.query);
        return { query: args.query, results };
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

            // Tool terminal: genera link de pago
            if (name === 'send_payment_link') {
                const book = getBookById(args.book_id);
                if (!book) {
                    logger.warn('⚠️ Tool send_payment_link con id inválido:', args.book_id);
                    // Agregamos el error como tool_result y dejamos que el modelo continúe
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
