import { getBookById } from './catalogService.js';
import { getPackBySlug } from './packService.js';
import { logger } from '../utils/logger.js';

const WEB_BASE_URL = process.env.WEB_BASE_URL || 'https://formacionparatodos.online';

const buildParams = (customerPhone, campaign) => new URLSearchParams({
    utm_source: 'whatsapp',
    utm_medium: 'bot',
    utm_campaign: campaign,
    ref: `bot-${customerPhone.slice(-4)}-${Date.now()}`,
});

export const getPaymentLink = async (bookId, bookTitle, customerPhone) => {
    const book = getBookById(bookId);
    if (!book || !book.slug) {
        throw new Error(`Libro ${bookId} no tiene slug — regenera data/catalog.json`);
    }

    const url = `${WEB_BASE_URL}/libro/${book.slug}?${buildParams(customerPhone, 'libros').toString()}`;
    logger.info('🔗 Link pago libro:', { bookId, slug: book.slug, phone: customerPhone });

    return { url, bookId, bookTitle: book.title, slug: book.slug };
};

export const getPackPaymentLink = async (packSlug, customerPhone) => {
    const pack = getPackBySlug(packSlug);
    if (!pack) {
        throw new Error(`Pack "${packSlug}" no existe`);
    }

    const url = `${WEB_BASE_URL}/pack/${pack.slug}?${buildParams(customerPhone, 'packs').toString()}`;
    logger.info('🔗 Link pago pack:', { slug: pack.slug, phone: customerPhone });

    return { url, packSlug: pack.slug, packTitle: pack.titulo };
};
