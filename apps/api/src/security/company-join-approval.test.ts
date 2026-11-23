import { Writable } from 'node:stream';
import { beforeEach, afterEach, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE, type User } from '@torfun/types';
import { buildApp } from '../app';
import { UnauthorizedError } from '../core/errors';
import { testEnv } from '../testing/env';
import { InMemoryClientStore } from '../testing/client-store';
import { InMemoryCompanyStore } from '../testing/company-store';
import { InMemoryExperienceStore } from '../testing/experience-store';
import { InMemoryRefreshTokenStore } from '../testing/refresh-token-store';
import { InMemoryUserStore } from '../testing/user-store';

/** A distinct, well-formed TIN per call: one Company per TIN. */
let tinCounter = 0;
function nextTin(): string {
  tinCounter += 1;
  return String(tinCounter).padStart(13, '0');
}

/**
 * ASVS V8.2.2, V8.2.3 / threat T-05; pentest finding P-1 (issue #200).
 *
 * The black-box run (docs/security/pentest, attack B6) registered a stranger,
 * found a Company by name, joined it in one call and read its registered
 * capital, certificates and past contracts. Joining is now a request that a
 * Company Manager answers, with automatic approval only for the manager's own
 * verified email domain. These tests replay the attack and probe the new rules.
 */

const ACME = 'บริษัท แอคมี ซอฟต์แวร์ จำกัด';

describe('joining a company needs a manager', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let users: InMemoryUserStore;
  let companies: InMemoryCompanyStore;
  let lines: { event?: string; audit?: boolean; [key: string]: unknown }[];
  let alice: User;
  let companyId: string;

  const session = (user: User) => ({
    [ACCESS_COOKIE]: app.jwt.sign({ user_id: user.id, username: user.username, role: user.role }),
  });

  const call = (
    user: User,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    app.inject({
      method,
      url: `/api${url}`,
      cookies: session(user),
      ...(payload ? { payload } : {}),
    });

  const companyOf = async (user: User) => (await users.findById(user.id))?.companyId ?? null;

  beforeEach(async () => {
    users = new InMemoryUserStore();
    companies = new InMemoryCompanyStore();
    lines = [];
    const stream = new Writable({
      write(chunk, _enc, done) {
        for (const line of String(chunk).split('\n').filter(Boolean)) lines.push(JSON.parse(line));
        done();
      },
    });
    app = await buildApp(
      testEnv({ LOG_LEVEL: 'info' }),
      {
        users,
        companies,
        clients: new InMemoryClientStore(),
        experiences: new InMemoryExperienceStore(),
        refreshTokens: new InMemoryRefreshTokenStore(),
      },
      { logStream: stream },
    );

    // Alice creates the company and records confidential evidence, as in B6.
    alice = users.seed({ username: 'alice', email: 'alice@acme.co.th' });
    companyId = (await call(alice, 'POST', '/companies', { name_th: ACME, tin: nextTin() })).json()
      .id;
    const evidence = await call(alice, 'POST', '/companies/me/qualifications', {
      company_id: companyId,
      revision: null,
      registered_capital_thb: 5_000_000,
      certificates: [
        { name: 'ISMS', standard: 'ISO/IEC 27001', issuer: 'BSI', valid_until: '2027-12-31' },
      ],
      personnel: [],
    });
    expect(evidence.statusCode).toBe(200);
    const client = (
      await call(alice, 'POST', '/clients', { name: 'กรมลูกค้าลับ', kind: 'government' })
    ).json();
    const experience = await call(alice, 'POST', '/experiences', {
      client_id: client.id,
      project_name: 'Confidential bid 42',
    });
    expect(experience.statusCode).toBe(201);
    // The evidence really is there for a member to read, so "not leaked" below means something.
    expect(
      JSON.stringify((await call(alice, 'GET', '/companies/me/qualifications')).json()),
    ).toContain('ISO/IEC 27001');
  });

  afterEach(async () => {
    await app.close();
  });

  test('pentest B6 replay: a stranger who asks to join reads nothing', async () => {
    const eve = users.seed({ username: 'eve' });
    const found = (
      await call(eve, 'GET', `/companies/search?q=${encodeURIComponent('แอคมี')}`)
    ).json();
    expect(found.companies[0].id).toBe(companyId);

    const join = await call(eve, 'POST', `/companies/${companyId}/join`);
    expect(join.statusCode).toBe(202);
    expect(join.json().outcome).toBe('pending');

    const leaked =
      JSON.stringify((await call(eve, 'GET', '/companies/me/qualifications')).json()) +
      JSON.stringify((await call(eve, 'GET', '/experiences')).json()) +
      JSON.stringify((await call(eve, 'GET', '/clients')).json());
    expect(leaked).not.toContain('ISO/IEC 27001');
    expect(leaked).not.toContain('5000000');
    expect(leaked).not.toContain('Confidential bid 42');
    expect(leaked).not.toContain('กรมลูกค้าลับ');
    expect((await call(eve, 'GET', '/companies/me')).statusCode).toBe(404);
    expect((await call(eve, 'GET', '/companies/me/members')).statusCode).toBe(404);
  });

  test('a manager approves; then, and only then, the newcomer sees the record', async () => {
    const bob = users.seed({ username: 'bob' });
    await call(bob, 'POST', `/companies/${companyId}/join`);

    const requests = (await call(alice, 'GET', '/companies/me/join-requests')).json().requests;
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ user_id: bob.id, username: 'bob' });

    expect(
      (await call(alice, 'POST', `/companies/me/join-requests/${bob.id}/approve`)).statusCode,
    ).toBe(204);
    expect(await companyOf(bob)).toBe(companyId);
    expect(JSON.stringify((await call(bob, 'GET', '/experiences')).json())).toContain(
      'Confidential bid 42',
    );
    expect((await call(bob, 'GET', '/companies/join-request')).statusCode).toBe(404);
  });

  test('a username that looks like an email is shown apart from the verified email', async () => {
    const impostor = users.seed({ username: 'ceo@acme.co.th' });
    const colleague = users.seed({ username: 'somchai', email: 'somchai@acme.co.th' });
    await call(impostor, 'POST', `/companies/${companyId}/join`);
    await call(colleague, 'POST', `/companies/${companyId}/join`);

    const requests = (await call(alice, 'GET', '/companies/me/join-requests')).json().requests;
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: 'ceo@acme.co.th', email: null }),
        expect.objectContaining({ username: 'somchai', email: 'somchai@acme.co.th' }),
      ]),
    );
  });

  test('a rejected request leaves the applicant outside', async () => {
    const eve = users.seed({ username: 'eve' });
    await call(eve, 'POST', `/companies/${companyId}/join`);
    expect(
      (await call(alice, 'POST', `/companies/me/join-requests/${eve.id}/reject`)).statusCode,
    ).toBe(204);
    expect(await companyOf(eve)).toBeNull();
    expect((await call(eve, 'GET', '/companies/join-request')).statusCode).toBe(404);
  });

  test('an applicant cannot approve themselves, and a plain member cannot approve anyone', async () => {
    const eve = users.seed({ username: 'eve' });
    const member = users.seed({ username: 'member' });
    await call(member, 'POST', `/companies/${companyId}/join`);
    await call(alice, 'POST', `/companies/me/join-requests/${member.id}/approve`);
    await call(eve, 'POST', `/companies/${companyId}/join`);

    // Eve has no company, so "my company's requests" do not exist for her.
    expect(
      (await call(eve, 'POST', `/companies/me/join-requests/${eve.id}/approve`)).statusCode,
    ).toBe(404);
    expect(
      (await call(member, 'POST', `/companies/me/join-requests/${eve.id}/approve`)).statusCode,
    ).toBe(403);
    expect((await call(member, 'GET', '/companies/me/join-requests')).statusCode).toBe(403);
    expect(
      (
        await call(member, 'PUT', `/companies/me/members/${member.id}/manager`, {
          is_manager: true,
        })
      ).statusCode,
    ).toBe(403);
    expect(await companyOf(eve)).toBeNull();
  });

  test("another company's manager cannot approve a request filed with this one", async () => {
    const mallory = users.seed({ username: 'mallory' });
    await call(mallory, 'POST', '/companies', { name_th: 'บริษัท มัลลอรี จำกัด', tin: nextTin() });
    const eve = users.seed({ username: 'eve' });
    await call(eve, 'POST', `/companies/${companyId}/join`);

    const res = await call(mallory, 'POST', `/companies/me/join-requests/${eve.id}/approve`);
    expect(res.statusCode).toBe(404);
    expect(await companyOf(eve)).toBeNull();
  });

  test('a withdrawn request can no longer be approved', async () => {
    const bob = users.seed({ username: 'bob' });
    await call(bob, 'POST', `/companies/${companyId}/join`);
    expect((await call(bob, 'DELETE', '/companies/join-request')).statusCode).toBe(204);
    expect(
      (await call(alice, 'POST', `/companies/me/join-requests/${bob.id}/approve`)).statusCode,
    ).toBe(404);
    expect(await companyOf(bob)).toBeNull();
  });

  describe('a Site Administrator never joins a company', () => {
    test('an officer promoted while waiting loses the request and cannot be approved', async () => {
      const bob = users.seed({ username: 'bob' });
      expect((await call(bob, 'POST', `/companies/${companyId}/join`)).statusCode).toBe(202);
      const root = users.seed({ username: 'root', role: 'admin' });
      expect(
        (await call(root, 'PATCH', `/admin/users/${bob.id}`, { role: 'admin' })).statusCode,
      ).toBe(200);

      const res = await call(alice, 'POST', `/companies/me/join-requests/${bob.id}/approve`);
      expect(res.statusCode).toBe(404);
      expect(await companyOf(bob)).toBeNull();
      expect((await users.findById(bob.id))?.joinRequest).toBeNull();
      expect((await call(alice, 'GET', '/companies/me/join-requests')).json().requests).toEqual([]);
    });

    test('a request left on an administrator account is never listed or accepted', async () => {
      // Data written before promotion cleared requests, or by a request that
      // raced the promotion: the store itself must refuse it.
      const admin = users.seed({ username: 'admin2', role: 'admin' });
      expect(await users.setJoinRequest(admin.id, companyId)).toBe(false);
      users.forceJoinRequest(admin.id, companyId);
      users.seed({ username: 'root', role: 'admin' });

      expect(await users.listJoinRequests(companyId)).toEqual([]);
      expect(await users.acceptJoinRequest(admin.id, companyId)).toBe(false);
      const res = await call(alice, 'POST', `/companies/me/join-requests/${admin.id}/approve`);
      expect(res.statusCode).toBe(404);
      expect(await companyOf(admin)).toBeNull();
    });

    test('a promotion that lands mid-join keeps the new administrator out', async () => {
      await call(alice, 'PUT', '/companies/me/auto-approve', { domain: 'acme.co.th' });
      const bob = users.seed({ username: 'bob', email: 'bob@acme.co.th' });

      // The join reads Bob as an officer; the promotion commits right after.
      const read = users.findById.bind(users);
      users.findById = async (id: string) => {
        const found = await read(id);
        if (id === bob.id) {
          users.findById = read;
          await users.setRole(bob.id, 'admin');
        }
        return found;
      };

      expect((await call(bob, 'POST', `/companies/${companyId}/join`)).statusCode).toBe(403);
      expect(await companyOf(bob)).toBeNull();
    });

    test('a promotion that lands mid-create keeps the new administrator out', async () => {
      const bob = users.seed({ username: 'bob' });
      const read = users.findById.bind(users);
      users.findById = async (id: string) => {
        const found = await read(id);
        if (id === bob.id) {
          users.findById = read;
          await users.setRole(bob.id, 'admin');
        }
        return found;
      };

      const res = await call(bob, 'POST', '/companies', {
        name_th: 'บริษัท บี จำกัด',
        tin: nextTin(),
      });
      expect(res.statusCode).toBe(403);
      expect(await companyOf(bob)).toBeNull();
    });

    test('deactivating an account withdraws its pending request', async () => {
      const bob = users.seed({ username: 'bob' });
      await call(bob, 'POST', `/companies/${companyId}/join`);
      const root = users.seed({ username: 'root', role: 'admin' });
      await call(root, 'PATCH', `/admin/users/${bob.id}`, { is_active: false });
      await call(root, 'PATCH', `/admin/users/${bob.id}`, { is_active: true });

      expect((await users.findById(bob.id))?.joinRequest).toBeNull();
      expect(
        (await call(alice, 'POST', `/companies/me/join-requests/${bob.id}/approve`)).statusCode,
      ).toBe(404);
    });
  });

  describe('automatic approval by email domain', () => {
    test('admits a verified address at exactly the domain, and nobody else', async () => {
      const on = await call(alice, 'PUT', '/companies/me/auto-approve', { domain: '@ACME.co.th' });
      expect(on.statusCode).toBe(200);
      expect(on.json().auto_approve_domain).toBe('acme.co.th');

      const colleague = users.seed({ username: 'colleague', email: 'somchai@acme.co.th' });
      const lookalike = users.seed({ username: 'lookalike', email: 'x@acme.co.th.evil.com' });
      const prefixed = users.seed({ username: 'prefixed', email: 'x@evil-acme.co.th' });
      const subdomain = users.seed({ username: 'subdomain', email: 'x@th.acme.co.th' });
      const noEmail = users.seed({ username: 'password-only' });

      expect((await call(colleague, 'POST', `/companies/${companyId}/join`)).statusCode).toBe(200);
      expect(await companyOf(colleague)).toBe(companyId);
      for (const outsider of [lookalike, prefixed, subdomain, noEmail]) {
        expect((await call(outsider, 'POST', `/companies/${companyId}/join`)).statusCode).toBe(202);
        expect(await companyOf(outsider)).toBeNull();
      }
    });

    test('a public mail provider is refused outright', async () => {
      for (const domain of ['gmail.com', 'hotmail.com', 'outlook.co.th']) {
        expect(
          (await call(alice, 'PUT', '/companies/me/auto-approve', { domain })).statusCode,
        ).toBe(400);
      }
    });

    test('a manager cannot claim a domain their own email is not at', async () => {
      const res = await call(alice, 'PUT', '/companies/me/auto-approve', {
        domain: 'bigcorp.co.th',
      });
      expect(res.statusCode).toBe(403);
      expect((await companies.findById(companyId))?.autoApproveDomain).toBeNull();
    });

    test('an unverified Google email never signs in, so it can never be auto-approved', async () => {
      await call(alice, 'PUT', '/companies/me/auto-approve', { domain: 'acme.co.th' });

      // Google says the address is unverified: no account is created or linked.
      await expect(
        app.authService.loginWithGoogle({
          sub: 'unverified-sub',
          email: 'intruder@acme.co.th',
          email_verified: false,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(await users.findByEmail('intruder@acme.co.th')).toBeNull();

      // The same address, verified, is what automatic approval trusts.
      const { user: verified } = await app.authService.loginWithGoogle({
        sub: 'verified-sub',
        email: 'somchai@acme.co.th',
        email_verified: true,
      });
      expect((await call(verified, 'POST', `/companies/${companyId}/join`)).statusCode).toBe(200);
      expect(await companyOf(verified)).toBe(companyId);
    });

    test('turning it off sends the next request back to a manager', async () => {
      await call(alice, 'PUT', '/companies/me/auto-approve', { domain: 'acme.co.th' });
      await call(alice, 'PUT', '/companies/me/auto-approve', { domain: null });
      const colleague = users.seed({ username: 'colleague', email: 'somchai@acme.co.th' });
      expect((await call(colleague, 'POST', `/companies/${companyId}/join`)).statusCode).toBe(202);
    });
  });

  describe('a company is never left without a manager', () => {
    const withMember = async () => {
      const bob = users.seed({ username: 'bob' });
      await call(bob, 'POST', `/companies/${companyId}/join`);
      await call(alice, 'POST', `/companies/me/join-requests/${bob.id}/approve`);
      return bob;
    };

    test('the last manager cannot step down or remove themselves', async () => {
      await withMember();
      expect(
        (
          await call(alice, 'PUT', `/companies/me/members/${alice.id}/manager`, {
            is_manager: false,
          })
        ).statusCode,
      ).toBe(409);
      expect((await call(alice, 'DELETE', `/companies/me/members/${alice.id}`)).statusCode).toBe(
        409,
      );
    });

    test('the last manager cannot walk away to another company while colleagues remain', async () => {
      await withMember();
      const other = await companies.create({ nameTh: 'บริษัท อื่น จำกัด', tin: null });
      expect((await call(alice, 'POST', `/companies/${other.id}/join`)).statusCode).toBe(409);
      expect(
        (await call(alice, 'POST', '/companies', { name_th: 'บริษัท ใหม่ จำกัด', tin: nextTin() }))
          .statusCode,
      ).toBe(409);
      expect(await companyOf(alice)).toBe(companyId);
    });

    test('after promoting a colleague, the old manager may go', async () => {
      const bob = await withMember();
      expect(
        (await call(alice, 'PUT', `/companies/me/members/${bob.id}/manager`, { is_manager: true }))
          .statusCode,
      ).toBe(204);
      expect(
        (await call(alice, 'POST', '/companies', { name_th: 'บริษัท ใหม่ จำกัด', tin: nextTin() }))
          .statusCode,
      ).toBe(201);
      // Leaving took Alice off the managers too, so rejoining gives her nothing.
      expect((await companies.findById(companyId))?.managerIds).toEqual([bob.id]);
      expect((await call(bob, 'GET', '/companies/me/members')).json().members).toEqual([
        expect.objectContaining({ id: bob.id, is_manager: true }),
      ]);
    });

    test('a manager who leaves and is later approved back in is not a manager again', async () => {
      const bob = await withMember();
      await call(alice, 'PUT', `/companies/me/members/${bob.id}/manager`, { is_manager: true });
      const own = (
        await call(alice, 'POST', '/companies', { name_th: 'บริษัท ใหม่ จำกัด', tin: nextTin() })
      ).json();

      expect((await call(alice, 'POST', `/companies/${companyId}/join`)).statusCode).toBe(202);
      expect(
        (await call(bob, 'POST', `/companies/me/join-requests/${alice.id}/approve`)).statusCode,
      ).toBe(204);

      expect(await companyOf(alice)).toBe(companyId);
      expect((await companies.findById(companyId))?.managerIds).toEqual([bob.id]);
      // She also left the Company she had made, and its managers with it.
      expect((await companies.findById(own.id))?.managerIds).toEqual([]);
      expect((await call(alice, 'GET', '/companies/me/join-requests')).statusCode).toBe(403);
    });

    test('an automatic join elsewhere takes the manager off the old Company', async () => {
      const bob = await withMember();
      await call(alice, 'PUT', `/companies/me/members/${bob.id}/manager`, { is_manager: true });
      const carol = users.seed({ username: 'carol', email: 'carol@beta.co.th' });
      const beta = (
        await call(carol, 'POST', '/companies', { name_th: 'บริษัท เบต้า จำกัด', tin: nextTin() })
      ).json();
      await call(carol, 'PUT', '/companies/me/auto-approve', { domain: 'beta.co.th' });
      users.seed({ ...(await users.findById(alice.id))!, email: 'alice@beta.co.th' });

      expect((await call(alice, 'POST', `/companies/${beta.id}/join`)).statusCode).toBe(200);
      expect((await companies.findById(companyId))?.managerIds).toEqual([bob.id]);
    });

    test('a removed manager is taken off the managers', async () => {
      const bob = await withMember();
      await call(alice, 'PUT', `/companies/me/members/${bob.id}/manager`, { is_manager: true });
      expect((await call(alice, 'DELETE', `/companies/me/members/${bob.id}`)).statusCode).toBe(204);
      expect((await companies.findById(companyId))?.managerIds).toEqual([alice.id]);
    });

    test('making a manager a Site Administrator takes them off the managers', async () => {
      const bob = await withMember();
      await call(alice, 'PUT', `/companies/me/members/${bob.id}/manager`, { is_manager: true });
      const root = users.seed({ username: 'root', role: 'admin' });
      expect(
        (await call(root, 'PATCH', `/admin/users/${bob.id}`, { role: 'admin' })).statusCode,
      ).toBe(200);
      expect(await companyOf(bob)).toBeNull();
      expect((await companies.findById(companyId))?.managerIds).toEqual([alice.id]);
    });

    /**
     * Holds the first `count` Company reads until all of them have arrived, so
     * concurrent requests all see the same managers before any of them writes:
     * the window a check-then-act guard loses.
     */
    const holdCompanyReads = (count: number) => {
      const read = companies.findById.bind(companies);
      const waiting: (() => void)[] = [];
      companies.findById = async (id: string) => {
        if (waiting.length < count) {
          await new Promise<void>((resolve) => {
            waiting.push(resolve);
            if (waiting.length === count) for (const release of waiting) release();
          });
        }
        return read(id);
      };
      return () => {
        companies.findById = read;
      };
    };

    test('two managers stepping down at once leave one manager', async () => {
      const bob = await withMember();
      await call(alice, 'PUT', `/companies/me/members/${bob.id}/manager`, { is_manager: true });

      const release = holdCompanyReads(2);
      const statuses = (
        await Promise.all([
          call(alice, 'PUT', `/companies/me/members/${alice.id}/manager`, { is_manager: false }),
          call(bob, 'PUT', `/companies/me/members/${bob.id}/manager`, { is_manager: false }),
        ])
      ).map((res) => res.statusCode);
      release();

      expect(statuses.sort()).toEqual([204, 409]);
      expect((await companies.findById(companyId))?.managerIds).toHaveLength(1);
    });

    test('two managers leaving at once cannot strand the members left behind', async () => {
      const bob = await withMember();
      await call(alice, 'PUT', `/companies/me/members/${bob.id}/manager`, { is_manager: true });
      const carol = users.seed({ username: 'carol' });
      await call(carol, 'POST', `/companies/${companyId}/join`);
      await call(alice, 'POST', `/companies/me/join-requests/${carol.id}/approve`);

      const release = holdCompanyReads(2);
      const statuses = (
        await Promise.all([
          call(alice, 'POST', '/companies', { name_th: 'บริษัท เอ จำกัด', tin: nextTin() }),
          call(bob, 'POST', '/companies', { name_th: 'บริษัท บี จำกัด', tin: nextTin() }),
        ])
      ).map((res) => res.statusCode);
      release();

      expect(statuses.sort()).toEqual([201, 409]);
      const managers = (await call(carol, 'GET', '/companies/me/members'))
        .json()
        .members.filter((member: { is_manager: boolean }) => member.is_manager);
      expect(managers).toHaveLength(1);
    });

    test('a removed member loses the record at once', async () => {
      const bob = await withMember();
      expect((await call(alice, 'DELETE', `/companies/me/members/${bob.id}`)).statusCode).toBe(204);
      expect(await companyOf(bob)).toBeNull();
      expect(JSON.stringify((await call(bob, 'GET', '/experiences')).json())).not.toContain(
        'Confidential bid 42',
      );
    });

    test('a Site Administrator can appoint a manager from the members, never a stranger', async () => {
      const bob = await withMember();
      const root = users.seed({ username: 'root', role: 'admin' });
      const eve = users.seed({ username: 'eve' });
      const assign = (userId: string) =>
        call(root, 'POST', `/admin/companies/${companyId}/managers`, { user_id: userId });

      expect((await assign(eve.id)).statusCode).toBe(404);
      expect(await companyOf(eve)).toBeNull();
      expect((await assign(bob.id)).statusCode).toBe(204);
      expect((await companies.findById(companyId))?.managerIds).toContain(bob.id);
      // And an officer cannot use the admin route to promote themselves.
      expect(
        (await call(bob, 'POST', `/admin/companies/${companyId}/managers`, { user_id: bob.id }))
          .statusCode,
      ).toBe(403);
    });
  });

  test('every membership decision lands in the audit trail', async () => {
    const bob = users.seed({ username: 'bob' });
    await call(bob, 'POST', `/companies/${companyId}/join`);
    await call(alice, 'POST', `/companies/me/join-requests/${bob.id}/approve`);
    await call(alice, 'PUT', '/companies/me/auto-approve', { domain: 'acme.co.th' });

    const events = lines.filter((line) => line.audit).map((line) => line.event);
    expect(events).toEqual(
      expect.arrayContaining([
        'company.created',
        'company.join.requested',
        'company.join.approved',
        'company.settings.changed',
      ]),
    );
    const approved = lines.find((line) => line.event === 'company.join.approved');
    expect(approved).toMatchObject({ userId: alice.id, targetUserId: bob.id, companyId });
  });
});
