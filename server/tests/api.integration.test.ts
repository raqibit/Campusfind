import assert from "node:assert/strict";
import test from "node:test";

if (!process.env.RUN_API_INTEGRATION_TESTS) {
  test("API integration suite (set RUN_API_INTEGRATION_TESTS=1 to run)", { skip: "integration tests are opt-in" }, () => {});
} else {
  const { createApp } = await import("../src/app.js");
  const { connectDatabase } = await import("../src/config/database.js");
  const { ChatMessage } = await import("../src/models/chat-message.js");
  const { Claim } = await import("../src/models/claim.js");
  const { Handover } = await import("../src/models/handover.js");
  const { Match } = await import("../src/models/match.js");
  const { Notification } = await import("../src/models/notification.js");
  const { Report } = await import("../src/models/report.js");
  const { University } = await import("../src/models/university.js");
  const { User } = await import("../src/models/user.js");
  const { signAccessToken } = await import("../src/services/jwt.js");
  const { default: mongoose } = await import("mongoose");

  type Session = { token: string; userId: string };
  type Fixture = {
    owner: Session;
    finder: Session;
    outsider: Session;
    admin: Session;
    matchId: string;
  };

  let baseUrl = "";
  let server: ReturnType<typeof createApp> extends never ? never : Awaited<ReturnType<typeof startServer>>;

  async function startServer(app: ReturnType<typeof createApp>) {
    const listener = app.listen(0);
    await new Promise<void>((resolve, reject) => {
      listener.once("listening", () => resolve());
      listener.once("error", reject);
    });
    const address = listener.address();
    if (!address || typeof address === "string") throw new Error("The integration server did not bind to a TCP port.");
    return { listener, url: `http://127.0.0.1:${address.port}` };
  }

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
    });
    const body = response.status === 204 ? undefined : await response.json() as { data?: Record<string, unknown> | Array<unknown>; error?: { code?: string } };
    return { response, body };
  }

  function auth(session: Session) {
    return { Authorization: `Bearer ${session.token}` };
  }

  async function createFixture(): Promise<Fixture> {
    const university = await University.create({
      name: "Integration University",
      shortName: `TEST${Date.now().toString().slice(-5)}`,
      emailDomain: `integration-${Date.now()}@example.edu`.split("@")[1],
      campuses: ["Main campus"],
    });
    const users = await User.create([
      { fullName: "Integration Owner", email: `owner-${Date.now()}@integration.example.edu`, matricNumber: `OWN-${Date.now()}`, university: university._id, verified: true, role: "student" },
      { fullName: "Integration Finder", email: `finder-${Date.now()}@integration.example.edu`, matricNumber: `FND-${Date.now()}`, university: university._id, verified: true, role: "finder" },
      { fullName: "Integration Outsider", email: `outsider-${Date.now()}@integration.example.edu`, matricNumber: `OUT-${Date.now()}`, university: university._id, verified: true, role: "student" },
      { fullName: "Integration Admin", email: `admin-${Date.now()}@integration.example.edu`, matricNumber: `ADM-${Date.now()}`, university: university._id, verified: true, role: "admin" },
    ]);
    const [owner, finder, outsider, admin] = users;
    if (!owner || !finder || !outsider || !admin) throw new Error("Fixture users were not created.");

    const tokenFor = (user: typeof owner): Session => ({
      userId: user.id,
      token: signAccessToken({ sub: user.id, universityId: university.id, role: user.role }),
    });
    const [lostReport, foundReport] = await Report.create([
      {
        university: university._id,
        reporter: owner._id,
        type: "lost",
        title: "Black wallet",
        category: "Wallet",
        publicDescription: "Black leather wallet lost near the library.",
        privateDetails: "A small scratch beside the card slot.",
        location: { label: "Main library" },
        happenedAt: new Date(),
        status: "claimed",
      },
      {
        university: university._id,
        reporter: finder._id,
        type: "found",
        title: "Wallet found near library",
        category: "Wallet",
        publicDescription: "Black wallet found near the library.",
        privateDetails: "A small scratch beside the card slot.",
        location: { label: "Main library" },
        happenedAt: new Date(),
        status: "matched",
      },
    ]);
    const match = await Match.create({
      university: university._id,
      lostReport: lostReport._id,
      foundReport: foundReport._id,
      score: 92,
      factors: { image: 50, text: 95, attributes: 100, location: 100, date: 100 },
      status: "suggested",
    });
    return { owner: tokenFor(owner), finder: tokenFor(finder), outsider: tokenFor(outsider), admin: tokenFor(admin), matchId: match.id };
  }

  test.before(async () => {
    await connectDatabase();
    await mongoose.connection.db?.dropDatabase();
    const started = await startServer(createApp());
    server = started;
    baseUrl = started.url;
  });

  test.after(async () => {
    await new Promise<void>((resolve, reject) => server.listener.close((error) => error ? reject(error) : resolve()));
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  test("runs the authenticated recovery workflow end to end", async () => {
    const fixture = await createFixture();

    const health = await request("/health");
    assert.equal(health.response.status, 200);

    const unauthorized = await request("/api/notifications");
    assert.equal(unauthorized.response.status, 401);

    const chatBeforeClaim = await request(`/api/chats/${fixture.matchId}/messages`, { headers: auth(fixture.owner) });
    assert.equal(chatBeforeClaim.response.status, 404);

    const claim = await request("/api/claims", {
      method: "POST",
      headers: auth(fixture.owner),
      body: JSON.stringify({ matchId: fixture.matchId, privateDetail: "The scratch is beside the card slot." }),
    });
    assert.equal(claim.response.status, 201);
    const claimId = String((claim.body?.data as Record<string, unknown>).id);

    const message = await request(`/api/chats/${fixture.matchId}/messages`, {
      method: "POST",
      headers: auth(fixture.owner),
      body: JSON.stringify({ body: "I can meet at the library help desk." }),
    });
    assert.equal(message.response.status, 201);
    assert.equal((await Notification.countDocuments({ user: fixture.finder.userId, kind: "chat" })), 1);

    const blockedMessage = await request(`/api/chats/${fixture.matchId}/messages`, {
      method: "POST",
      headers: auth(fixture.owner),
      body: JSON.stringify({ body: "Email me at owner@example.edu" }),
    });
    assert.equal(blockedMessage.response.status, 422);
    assert.equal(blockedMessage.body?.error?.code, "CONTACT_DETAILS_BLOCKED");

    const outsiderChat = await request(`/api/chats/${fixture.matchId}/messages`, { headers: auth(fixture.outsider) });
    assert.equal(outsiderChat.response.status, 403);

    const adminClaims = await request("/api/admin/claims", { headers: auth(fixture.admin) });
    assert.equal(adminClaims.response.status, 200);
    assert.equal((adminClaims.body?.data as Array<unknown>).length, 1);

    const review = await request(`/api/admin/claims/${claimId}`, {
      method: "PATCH",
      headers: auth(fixture.admin),
      body: JSON.stringify({
        status: "approved",
        reviewNote: "The private detail matches the found report.",
        handoverPoint: "Main library help desk",
        scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    });
    assert.equal(review.response.status, 200);

    const handovers = await request("/api/handovers/my", { headers: auth(fixture.owner) });
    assert.equal(handovers.response.status, 200);
    const handoverId = String(((handovers.body?.data as Array<Record<string, unknown>>)[0])?._id);

    const ownerConfirmation = await request(`/api/handovers/${handoverId}/confirm`, {
      method: "PATCH",
      headers: auth(fixture.owner),
      body: JSON.stringify({ party: "owner" }),
    });
    assert.equal(ownerConfirmation.response.status, 200);
    const finderConfirmation = await request(`/api/handovers/${handoverId}/confirm`, {
      method: "PATCH",
      headers: auth(fixture.finder),
      body: JSON.stringify({ party: "finder" }),
    });
    assert.equal(finderConfirmation.response.status, 200);

    assert.equal(await Claim.countDocuments({ _id: claimId, status: "approved" }), 1);
    assert.equal(await Handover.countDocuments({ _id: handoverId, completedAt: { $ne: null } }), 1);
    assert.equal(await Report.countDocuments({ status: "returned" }), 2);
    assert.equal(await ChatMessage.countDocuments({ match: fixture.matchId }), 1);
  });
}
