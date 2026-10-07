import { getBookById } from './catalogService.js';
import { logger } from '../utils/logger.js';

const WEB_BASE_URL = process.env.WEB_BASE_URL || 'https://formacionparatodos.online';

export const getPaymentLink = async (bookId, bookTitle, customerPhone) => {
    const book = getBookById(bookId);
    if (!book || !book.slug) {
        throw new Error(`Libro ${bookId} no tiene slug — regenera data/catalog.json`);
    }

    const params = new URLSearchParams({
        utm_source: 'whatsapp',
        utm_medium: 'bot',
        utm_campaign: 'libros',
        ref: `bot-${customerPhone.slice(-4)}-${Date.now()}`,
    });

    const url = `${WEB_BASE_URL}/libro/${book.slug}?${params.toString()}`;

    logger.info('🔗 Link pago (web Bold):', { bookId, slug: book.slug, phone: customerPhone });

    return { url, bookId, bookTitle: book.title, slug: book.slug };
};
