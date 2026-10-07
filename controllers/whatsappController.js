import { sendWhatsAppMessage, markMessageAsRead } from '../services/whatsappService.js';
import { getAIResponse } from '../services/geminiService.js';
import { getPaymentLink } from '../services/paymentService.js';
import { isAdminCommand, processAdminCommand } from '../services/adminService.js';
import { deliverBook } from '../services/credentialService.js';
import { findOrderByReference, updateOrderStatus } from '../services/orderService.js';
import { logger } from '../utils/logger.js';
import { conversationCache } from '../utils/cache.js';

export const verifyWebhook = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        logger.info('✅ Webhook verified');
        res.status(200).send(challenge);
    } else {
        logger.error('❌ Webhook verification failed');
        res.status(403).json({ error: 'Forbidden' });
    }
};

export const handleIncomingMessage = async (req, res) => {
    try {
        res.sendStatus(200);

        const body = req.body;
        if (!body.object || body.object !== 'whatsapp_business_account') return;

        const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message) return;

        const from = message.from;
        const messageId = message.id;
        const messageType = message.type;

        logger.info(`📩 Message from ${from} [${messageType}]`);
        await markMessageAsRead(messageId);

        if (messageType !== 'text') {
            await sendWhatsAppMessage(from, {
                type: 'text',
                text: { body: 'Escríbeme un mensaje de texto para ayudarte.' },
            });
            return;
        }

        const userMessage = message.text.body;
        logger.info(`💬 "${userMessage}"`);

        // ── Admin ──────────────────────────────────────────────────
        if (isAdminCommand(from, userMessage)) {
            const response = processAdminCommand(userMessage);
            await sendWhatsAppMessage(from, { type: 'text', text: { body: response } });
            return;
        }

        // ── Respuesta IA (con function calling) ────────────────────
        const history = conversationCache.get(from) || [];
        history.push({ role: 'user', content: userMessage, timestamp: new Date().toISOString() });

        const { text, action } = await getAIResponse(history);

        history.push({ role: 'assistant', content: text, timestamp: new Date().toISOString() });
        conversationCache.set(from, history.slice(-20));

        await sendWhatsAppMessage(from, { type: 'text', text: { body: text } });

        // ── Si la IA decidió enviar link de pago ───────────────────
        if (action?.type === 'send_payment_link') {
            try {
                const paymentData = await getPaymentLink(action.bookId, action.bookTitle, from);
                await sendWhatsAppMessage(from, {
                    type: 'text',
                    text: { body: `💳 *Link de pago:*\n\n${paymentData.url}\n\n📬 Al confirmar el pago, el libro te llega automáticamente a tu correo.` },
                });
                logger.info(`💳 Link enviado a ${from} para book ${action.bookId}`);
            } catch (payErr) {
                logger.error('❌ Error enviando link de pago:', payErr);
                await sendWhatsAppMessage(from, {
                    type: 'text',
                    text: { body: 'Uy, la pasarela se cayó un segundo 😅 dame 1 minuto y te reenvío el link.' },
                });
            }
        }

    } catch (err) {
        logger.error('❌ Error handling message:', err);
    }
};

// ── Wompi webhook ─────────────────────────────────────────────────────────────
export const handleWompiWebhook = async (req, res) => {
    try {
        res.sendStatus(200);

        const event = req.body?.event;
        const transaction = req.body?.data?.transaction;

        logger.info(`💳 Wompi event: ${event} | status: ${transaction?.status}`);

        if (event !== 'transaction.updated' || transaction?.status !== 'APPROVED') return;

        const order = findOrderByReference(transaction.reference);
        if (!order) {
            logger.warn(`⚠️ Orden no encontrada: ${transaction.reference}`);
            return;
        }
        if (order.status === 'approved') return;

        updateOrderStatus(transaction.reference, 'approved');
        await deliverBook(order);

    } catch (err) {
        logger.error('❌ Wompi webhook error:', err);
    }
};
