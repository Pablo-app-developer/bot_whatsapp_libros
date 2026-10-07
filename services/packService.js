import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKS_PATH = path.join(__dirname, '..', 'data', 'packs.json');

let _packs = null;
let _bySlug = null;

const load = () => {
    if (_packs) return;
    const raw = fs.readFileSync(PACKS_PATH, 'utf-8');
    _packs = JSON.parse(raw);
    _bySlug = new Map(_packs.map(p => [p.slug, p]));
    logger.info(`📦 Packs cargados: ${_packs.length}`);
};

export const listPacks = () => {
    load();
    return _packs.map(p => ({
        slug: p.slug,
        titulo: p.titulo,
        emoji: p.emoji,
        tema: p.tema,
        descripcion: p.descripcion,
        total_libros: p.libros_slugs.length,
        precio_cop: Math.floor(p.precio_cop_centavos / 100),
        destacado: !!p.destacado,
    }));
};

export const getPackBySlug = (slug) => {
    load();
    return _bySlug.get(slug) || null;
};

export const getPackByCategory = (categoryName) => {
    load();
    const pack = _packs.find(p => p.tema === categoryName);
    if (!pack) return null;
    return {
        slug: pack.slug,
        titulo: pack.titulo,
        emoji: pack.emoji,
        precio_cop: Math.floor(pack.precio_cop_centavos / 100),
        ahorro_cop: 100000,
    };
};
