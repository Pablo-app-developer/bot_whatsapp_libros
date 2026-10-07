import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { getPackByCategory } from './packService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');

let _catalog = null;
let _byId = null;
let _byCategory = null;

const load = () => {
    if (_catalog) return;
    const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
    _catalog = JSON.parse(raw);
    _byId = new Map(_catalog.map(b => [b.id, b]));
    _byCategory = new Map();
    for (const b of _catalog) {
        if (!_byCategory.has(b.category)) _byCategory.set(b.category, []);
        _byCategory.get(b.category).push(b);
    }
    logger.info(`📚 Catálogo cargado: ${_catalog.length} libros, ${_byCategory.size} categorías`);
};

export const listCategories = () => {
    load();
    return [..._byCategory.entries()].map(([name, books]) => ({
        name,
        count: books.length,
    })).sort((a, b) => b.count - a.count);
};

export const listBooksByCategory = (categoryName, limit = 12) => {
    load();
    // Match case-insensitive y sin tildes
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const target = norm(categoryName);
    for (const [name, books] of _byCategory) {
        if (norm(name).includes(target) || target.includes(norm(name))) {
            const related_pack = getPackByCategory(name);
            return {
                category: name,
                total: books.length,
                books: books.slice(0, limit).map(b => ({ id: b.id, title: b.title })),
                ...(related_pack ? { related_pack } : {}),
            };
        }
    }
    return null;
};

export const searchBooks = (query, limit = 8) => {
    load();
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const terms = norm(query).split(/\s+/).filter(t => t.length > 2);
    if (terms.length === 0) return { query, results: [] };

    const scored = _catalog.map(b => {
        const hay = norm(b.title + ' ' + b.category);
        const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
        return { book: b, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

    const results = scored.map(x => ({
        id: x.book.id,
        title: x.book.title,
        category: x.book.category,
    }));

    // Si la mayoría (>=60%) cae en una misma categoría con pack, sugerir ese pack
    let related_pack = null;
    if (results.length >= 3) {
        const freq = {};
        results.forEach(r => { freq[r.category] = (freq[r.category] || 0) + 1; });
        const [topCat, topCount] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
        if (topCount / results.length >= 0.6) {
            related_pack = getPackByCategory(topCat);
        }
    }

    return { query, results, ...(related_pack ? { related_pack } : {}) };
};

export const getBookById = (id) => {
    load();
    return _byId.get(Number(id)) || null;
};
