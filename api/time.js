module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({ now: Date.now() });
};
