import express from 'express';
import { verifyWebhook, handleIncomingMessage } from '../controllers/whatsappController.js';

const router = express.Router();

router.get('/', verifyWebhook);
router.post('/', handleIncomingMessage);

router.get('/test', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
