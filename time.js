// Vercel Serverless Function — devolve a hora do servidor (ms desde 1970).
// O relógio de blinds usa isso para corrigir aparelhos com a hora errada.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({ now: Date.now() });
};
