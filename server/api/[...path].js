// Vercel serverless funksiya (Root Directory = server).
// Bütün /api/* sorğuları buradan keçir və Express app-ə ötürülür.
const app = require('../index.js');

module.exports = (req, res) => {
  const url = req.url || '/';
  // Vercel bəzən yalnız qalan hissəni ötürür — /api prefiksi bərpa edilir
  if (!url.startsWith('/api')) {
    req.url = url === '/' ? '/api' : '/api' + url;
  }
  return app(req, res);
};