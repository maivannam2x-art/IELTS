export async function GET() {
  return Response.json({ ok: true, app: 'IELTS Vocabulary Trainer', time: new Date().toISOString() });
}
