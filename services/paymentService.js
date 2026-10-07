import { createOrder, findOrderByReference, updateOrderStatus } from './orderService.js';
import { deliverBook } from './credentialService.js';
import { logger } from '../utils/logger.js';

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

export const getPaymentLink = async (bookId, bookTitle, customerPhone) => {
    const amount = 20000;
    const reference = `FPT-book${bookId}-${Date.now()}-${customerPhone.slice(-4)}`;

    createOrder({
        reference,
        phone: customerPhone,
        bookId,
        service: `book_${bookId}`,
        plan: 'libro',
        amount,
    });

    const body = {
        items: [{
            title: `Libro: ${bookTitle}`,
            quantity: 1,
            unit_price: amount,
            currency_id: 'COP',
        }],
        external_reference: reference,
        back_urls: {
            success: 'https://formacionparatodos.online',
            failure: 'https://formacionparatodos.online',
            pending: 'https://formacionparatodos.online',
        },
        auto_return: 'approved',
    };

    // notification_url solo si esta explicitamente habilitado.
    // MP rechaza subdominios *.up.railway.app; el webhook se configura desde el panel de MP.
    if (process.env.MP_NOTIFICATION_URL) {
        body.notification_url = process.env.MP_NOTIFICATION_URL;
    }

    let response;
    try {
        response = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
    } catch (fetchError) {
        logger.error('❌ Error de red MP:', { message: fetchError.message, cause: String(fetchError.cause) });
        throw fetchError;
    }

    const data = await response.json();
    logger.info('📡 MP API response:', { status: response.status, id: data.id });

    if (!response.ok) {
        logger.error('❌ MP API error:', { status: response.status, body: data });
        throw new Error(`MP API error ${response.status}`);
    }

    // MP_MODE=production usa init_point, cualquier otro valor (o vacío) usa sandbox_init_point
    const url = process.env.MP_MODE === 'production' ? data.init_point : data.sandbox_init_point;

    logger.info('💳 Link MP generado:', { bookId, reference, url });

    return { url, reference, amount, bookId };
};

export const handleMPWebhook = async (webhookData) => {
    try {
        const { type, data } = webhookData;

        if (type !== 'payment' || !data?.id) {
            return { processed: false };
        }

        logger.info('📥 MP webhook recibido:', { type, paymentId: data.id });

        // Consultar detalles del pago a MP
        const res = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
            headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
        });
        const payment = await res.json();

        logger.info('💰 MP pago:', { status: payment.status, reference: payment.external_reference });

        if (payment.status !== 'approved') {
            return { processed: true };
        }

        const order = findOrderByReference(payment.external_reference);
        if (!order) {
            logger.error('❌ Orden no encontrada:', payment.external_reference);
            return { processed: false, error: 'order_not_found' };
        }

        if (order.status === 'approved') {
            return { processed: true };
        }

        updateOrderStatus(payment.external_reference, 'approved');
        await deliverBook(order);

        logger.info('✅ Curso entregado:', { reference: payment.external_reference, phone: order.phone });
        return { processed: true };

    } catch (error) {
        logger.error('❌ Error procesando webhook MP:', error);
        throw error;
    }
};
