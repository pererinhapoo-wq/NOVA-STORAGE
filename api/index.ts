import app from '../src/server/app.ts';

export default function handler(req: any, res: any) {
  return app(req, res);
}
