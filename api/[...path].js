// Vercel serverless funksiya — bütün /api/* sorğuları buraya gəlir.
// Express app-ə ötürürülür; /api prefiksi hər halda bərpa edilir
// (Vercel bəzən yalnız qalan hissəni ötürür).
const app = require('../server/index.js');

module.exports = (req, res) => {
  const url = req.url || '/';
  if (!url.startsWith('/api')) {
    req.url = url === '/' ? '/api' : '/api' + url;
  }
  return app(req, res);
};