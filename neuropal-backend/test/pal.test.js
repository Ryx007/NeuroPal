// Pal as a buddy: POST /api/pal/breakdown, POST + DELETE /api/pal/chat.
// Real (in-memory) MongoDB and real HTTP; only the model call is stubbed
// (routes/pal.js → __setGenerate). Run: npm test
const assert = require('node:assert/strict');
const { after, before, beforeEach, test } = require('node:test');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const SECRET = 'pal-test-secret-'.padEnd(48, 'x');
let mongod;
let server;
let base;
let pal;
const calls = [];
let answer = async () => ({ data: {}, provider: 'stub', model: 'stub-1' });

before(async () => {
    process.env.LOCAL_MODE = 'true';
    process.env.JWT_SECRET = SECRET;
    delete process.env.PAL_CHAT_PER_HOUR;
    delete process.env.PAL_BREAKDOWN_PER_HOUR;
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    pal = require('../src/routes/pal');
    pal.__setGenerate(async (opts) => {
        calls.push(opts);
        return answer(opts);
    });
    const buildApp = require('../src/app');
    server = buildApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    pal.__setGenerate(null);
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
    await mongod.stop();
});

beforeEach(() => {
    process.env.LOCAL_MODE = 'true';
    calls.length = 0;
    pal.__resetLimits();
});

const send = (method, p, body, headers = {}) =>
    fetch(`${base}${p}`, {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
const post = (p, body, headers) => send('POST', p, body, headers);
const messages = () => mongoose.connection.collection('companionmessages');

// ---- breakdown ----------------------------------------------------------------

test('breakdown checks its input', async () => {
    assert.equal((await post('/api/pal/breakdown', {})).status, 400);
    assert.equal((await post('/api/pal/breakdown', { task: '   ' })).status, 400);
    assert.equal((await post('/api/pal/breakdown', { task: 42 })).status, 400);
    const long = await post('/api/pal/breakdown', { task: 'x'.repeat(501) });
    assert.equal(long.status, 422);
    assert.match((await long.json()).error, /500 characters/);
    assert.equal(calls.length, 0, 'the model is never called for bad input');
});

test('breakdown returns 3–7 clean steps of at most 12 words', async () => {
    answer = async () => ({
        data: {
            steps: [
                '1. Open the file',
                '- write one sentence about the very long thing that goes on and on and on forever',
                '',
                'Step 3: Take a two minute break',
                'open the file!',
                { text: '• Save it' },
                'Read it once',
                'Send it',
                'Celebrate',
                'One more',
            ],
        },
        provider: 'stub',
        model: 'stub-1',
    });
    const r = await post('/api/pal/breakdown', { task: '  Write the intro\n of my thesis  ' });
    assert.equal(r.status, 200);
    const { steps, provider } = await r.json();
    assert.equal(provider, 'stub');
    assert.deepEqual(steps, [
        'Open the file',
        'Write one sentence about the very long thing that goes on',
        'Take a two minute break',
        'Save it',
        'Read it once',
        'Send it',
        'Celebrate',
    ]);
    for (const s of steps) assert.ok(s.split(' ').length <= 12, s);
    // the prompt carries the rules and the task as quoted data
    assert.equal(calls.length, 1);
    assert.match(calls[0].systemPrompt, /at most 12 words/);
    assert.match(calls[0].systemPrompt, /less than two minutes/);
    assert.match(calls[0].task, /"""Write the intro of my thesis"""/);
    assert.equal(calls[0].geminiSchema.properties.steps.type, 'ARRAY');
});

test('breakdown answers 502 when the steps are unusable, so the app uses its own', async () => {
    answer = async () => ({ data: { steps: ['Just do it'] }, provider: 'stub' });
    const r = await post('/api/pal/breakdown', { task: 'clean the kitchen' });
    assert.equal(r.status, 502);
    assert.ok((await r.json()).error);
});

test('a failing model is a clean error, and an exposed one keeps its status', async () => {
    answer = async () => {
        throw new Error('GEMINI_API_KEY is not set');
    };
    const r = await post('/api/pal/breakdown', { task: 'email my supervisor' });
    assert.equal(r.status, 502);
    assert.match((await r.json()).error, /Pal couldn’t/);

    answer = async () => {
        const e = new Error('The AI service has used up its quota for now — please try again later.');
        e.status = 503;
        e.expose = true;
        throw e;
    };
    const q = await post('/api/pal/chat', { message: 'hi' });
    assert.equal(q.status, 503);
    assert.match((await q.json()).error, /quota/);
});

// ---- chat -------------------------------------------------------------------------

test('chat checks its input', async () => {
    assert.equal((await post('/api/pal/chat', {})).status, 400);
    assert.equal((await post('/api/pal/chat', { message: '' })).status, 400);
    assert.equal((await post('/api/pal/chat', { message: 'x'.repeat(1001) })).status, 422);
    assert.equal(calls.length, 0);
});

test('chat replies briefly, follows the rules and remembers both turns', async () => {
    await messages().deleteMany({});
    answer = async () => ({ data: { reply: '  "Two minutes on the meds first. Then lunch."  ' }, provider: 'stub', model: 'stub-1' });
    const context = {
        state: 'yellow',
        localTime: '12:08',
        nextAnchor: { title: 'Lunch break', at: '12:30', inMinutes: 22 },
        minimumDay: ['Take meds', 'Walk'],
        palName: 'Quark',
        talkStyle: 'Nerdy',
        people: true,
    };
    const r = await post('/api/pal/chat', { message: 'What should I do first?', context });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.reply, 'Two minutes on the meds first. Then lunch.');
    assert.equal(body.crisis, false);

    const sys = calls[0].systemPrompt;
    assert.match(sys, /You are Quark/);
    assert.match(sys, /at most 80 words/);
    assert.match(sys, /Never agree just to please/);
    assert.match(sys, /Never diagnose\. Never give medication or dosage advice/);
    assert.match(sys, /suggest a professional/);
    assert.match(sys, /local emergency services/);
    assert.match(sys, /Don’t make the user depend on you/);
    assert.match(sys, /suggest a person/);
    assert.match(sys, /name a real source inline/);
    assert.match(sys, /superposition/, 'the Nerdy talk style is the voice example');
    const task = calls[0].task;
    assert.match(task, /State: a bit off \(yellow\)/);
    assert.match(task, /Next anchor: Lunch break \(at 12:30, in 22 min\)/);
    assert.match(task, /Take meds; Walk/);
    assert.match(task, /this is the first message/);

    const stored = await messages().find({ threadId: 'pal' }).sort({ _id: 1 }).toArray();
    assert.deepEqual(stored.map((m) => m.role), ['user', 'assistant']);
    assert.equal(stored[0].content, 'What should I do first?');
    assert.equal(stored[0].contextBundle.nervousState, 'yellow');
    assert.equal(stored[0].contextBundle.mvdRemaining, 2);
    assert.equal(stored[1].content, body.reply);
    assert.equal(String(stored[0].userId), String(stored[1].userId));

    // the next message carries the conversation so far
    answer = async () => ({ data: { reply: 'Sounds good.' }, provider: 'stub' });
    await post('/api/pal/chat', { message: 'Okay, meds done', context });
    assert.match(calls[1].task, /User: What should I do first\?/);
    assert.match(calls[1].task, /Quark: Two minutes on the meds first\. Then lunch\./);
});

test('people off: Pal only mentions people when asked', async () => {
    answer = async () => ({ data: { reply: 'Okay.' } });
    await post('/api/pal/chat', { message: 'hello', context: { people: false } });
    assert.match(calls[0].systemPrompt, /Only mention other people if the user asks/);
});

test('junk context is cleaned, never trusted', async () => {
    answer = async () => ({ data: { answer: 'Plain fallback text.' } });
    const r = await post('/api/pal/chat', {
        message: 'hi',
        context: { state: 'purple', localTime: '25:99', nextAnchor: ['x'], minimumDay: 'nope', palName: 'P'.repeat(40), talkStyle: 'constructor' },
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).reply, 'Plain fallback text.');
    const { task, systemPrompt } = calls[0];
    assert.match(task, /State: not checked in yet/);
    assert.doesNotMatch(task, /25:99/);
    assert.match(task, /Next anchor: none today/);
    assert.match(task, /nothing left/);
    assert.match(systemPrompt, new RegExp(`You are ${'P'.repeat(14)},`));
    assert.match(systemPrompt, /warm, unhurried/, 'unknown talk style → Gentle');
});

test('a runaway reply is trimmed at a sentence end', async () => {
    const long = `${'This is a sentence with eight words in it. '.repeat(20)}`.trim();
    answer = async () => ({ data: { reply: long } });
    const { reply } = await (await post('/api/pal/chat', { message: 'talk to me' })).json();
    assert.ok(reply.split(' ').length <= 90, `${reply.split(' ').length} words`);
    assert.match(reply, /\.$/);
});

test('a message that sounds like a crisis gets the careful reply, not the model', async () => {
    await messages().deleteMany({});
    const r = await post('/api/pal/chat', { message: 'I don’t want to be alive anymore', context: { state: 'red' } });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.crisis, true);
    assert.match(body.reply, /can’t help with this on my own/);
    assert.match(body.reply, /local emergency number/);
    assert.match(body.reply, /someone you trust/);
    assert.match(body.reply, /calming steps/);
    assert.equal(calls.length, 0, 'never sent to the model');
    const stored = await messages().find({ threadId: 'pal' }).sort({ _id: 1 }).toArray();
    assert.equal(stored.length, 2);
    assert.equal(stored[1].contextBundle.extras.crisis, true);
    assert.equal(stored[0].contextBundle.nervousState, 'red');
    // and ordinary hyperbole is not a crisis
    answer = async () => ({ data: { reply: 'Bugs are rude. Want to break it down?' } });
    const ok = await (await post('/api/pal/chat', { message: 'this bug is killing me' })).json();
    assert.equal(ok.crisis, false);
});

test('the crisis check covers common phrasings and other languages, not everyday talk', () => {
    const { looksLikeCrisis } = require('../src/routes/pal');
    for (const m of [
        'i want to end it',
        'honestly i might kms tonight',
        'I took all my pills',
        'nobody would miss me if I was gone',
        'going to jump off the bridge tonight',
        'everyone is better off without me',
        'voglio morire',
        'non voglio più vivere',
        'quiero morirme',
        'je veux mourir',
        'ich will nicht mehr leben',
        'khudkushi',
    ]) {
        assert.equal(looksLikeCrisis(m), true, m);
    }
    for (const m of [
        'this bug is killing me',
        'I walked 5 kms today',
        "let's end it here for today",
        'I take my meds at 8',
        'I am dying to read this paper',
        'killing time before class',
    ]) {
        assert.equal(looksLikeCrisis(m), false, m);
    }
});

test('hourly caps: 30 breakdowns and 30 chats per user, separately; crisis replies are never capped', async () => {
    answer = async (opts) =>
        opts.geminiSchema.properties.steps
            ? { data: { steps: ['Open it', 'Do one part', 'Stop and check'] } }
            : { data: { reply: 'Okay.' } };
    for (let i = 0; i < 30; i += 1) {
        const r = await post('/api/pal/breakdown', { task: `task ${i}` });
        assert.equal(r.status, 200, `breakdown ${i}`);
    }
    const capped = await post('/api/pal/breakdown', { task: 'one more' });
    assert.equal(capped.status, 429);
    assert.ok(Number(capped.headers.get('retry-after')) > 0);
    const body = await capped.json();
    assert.ok(body.error && body.retryAfterSec > 0);
    assert.equal(calls.length, 30, 'a capped request never reaches the model');

    for (let i = 0; i < 30; i += 1) {
        assert.equal((await post('/api/pal/chat', { message: `hello ${i}` })).status, 200, `chat ${i}`);
    }
    assert.equal((await post('/api/pal/chat', { message: 'hello again' })).status, 429);
    const crisis = await post('/api/pal/chat', { message: 'I want to kill myself' });
    assert.equal(crisis.status, 200);
    assert.equal((await crisis.json()).crisis, true);
});

test('heavy use today: Pal is told to suggest a break or a person', async () => {
    await messages().deleteMany({});
    answer = async () => ({ data: { reply: 'Okay.' } });
    for (let i = 0; i < 12; i += 1) await post('/api/pal/chat', { message: `msg ${i}` });
    calls.length = 0;
    await post('/api/pal/chat', { message: 'and another' });
    assert.match(calls[0].systemPrompt, /chatted a lot today/);
});

test('DELETE /chat forgets only this user’s Pal chat', async () => {
    await messages().deleteMany({});
    answer = async () => ({ data: { reply: 'Hi.' } });
    await post('/api/pal/chat', { message: 'hello' });
    const other = new mongoose.Types.ObjectId();
    await messages().insertOne({ userId: other, threadId: 'pal', role: 'user', content: 'someone else', createdAt: new Date() });
    const { User } = require('../src/models');
    const me = await User.findOne({ email: 'local@neuropal.app' }).lean();
    await messages().insertOne({ userId: me._id, threadId: 'companion', role: 'user', content: 'another thread', createdAt: new Date() });

    const r = await send('DELETE', '/api/pal/chat');
    assert.equal(r.status, 200);
    assert.equal((await r.json()).deleted, 2);
    const left = await messages().find({}).toArray();
    assert.deepEqual(left.map((m) => m.content).sort(), ['another thread', 'someone else']);
});

test('every route needs a session when sign-in is on', async () => {
    process.env.LOCAL_MODE = 'false';
    assert.equal((await post('/api/pal/breakdown', { task: 'x' })).status, 401);
    assert.equal((await post('/api/pal/chat', { message: 'x' })).status, 401);
    assert.equal((await send('DELETE', '/api/pal/chat')).status, 401);
    assert.equal(calls.length, 0);
});

test('signed in: the daily AI budget is spent before the model is called', async () => {
    const { _resetAiBudgets } = require('../src/services/aiBudget');
    const { User } = require('../src/models');
    _resetAiBudgets();
    process.env.LOCAL_MODE = 'false';
    process.env.AI_DAILY_LIMIT_PER_USER = '2';
    try {
        const user = await User.create({ email: 'budget@example.com', passwordHash: 'x', name: 'B' });
        const token = jwt.sign({ sub: String(user._id) }, SECRET, { expiresIn: '1h' });
        const auth = { authorization: `Bearer ${token}` };
        answer = async (opts) =>
            opts.geminiSchema.properties.steps ? { data: { steps: ['Open it', 'Do one part', 'Stop and check'] } } : { data: { reply: 'Okay.' } };
        assert.equal((await post('/api/pal/breakdown', { task: 'a' }, auth)).status, 200);
        assert.equal((await post('/api/pal/chat', { message: 'b' }, auth)).status, 200);
        const spent = await post('/api/pal/chat', { message: 'c' }, auth);
        assert.equal(spent.status, 429);
        assert.equal(calls.length, 2, 'no model call once the budget is spent');
        // the careful crisis reply still comes through
        const crisis = await post('/api/pal/chat', { message: 'I want to die' }, auth);
        assert.equal(crisis.status, 200);
        // and the chat is scoped to this user
        const mine = await messages().countDocuments({ userId: user._id, threadId: 'pal' });
        assert.equal(mine, 4);
    } finally {
        delete process.env.AI_DAILY_LIMIT_PER_USER;
        _resetAiBudgets();
    }
});
