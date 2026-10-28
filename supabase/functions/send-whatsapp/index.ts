// WhatsApp integration removed.
Deno.serve(() => new Response(JSON.stringify({ error: 'removed' }), { status: 410 }));
