import app from '../src/server/app.ts';

export default function handler(req: any, res: any) {
  if (req.url && !req.url.startsWith('/api')) {
    if (req.url.startsWith('/storage') || req.url.startsWith('/health')) {
      req.url = `/api${req.url}`;
    }
  }
  return app(req, res);
}
