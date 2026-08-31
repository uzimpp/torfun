import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { get_users_collection } from '../database/mongodb';
import { ObjectId } from 'mongodb';
import { loadEnv } from '../config/env';

const register_schema = z
  .object({
    username: z.string().min(3).max(50),
    password: z.string().min(8).max(128),
    confirm_password: z.string(),
    company_name: z.string().min(1).max(200),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export async function authRoutes(app: FastifyInstance) {
  app.get('/google/callback', async (request, reply) => {
    try {
      const { token } = await app.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);

      const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
        },
      });

      if (!response.ok) {
        return reply.code(401).send({
          message: 'Unable to retrieve Google user information',
        });
      }

      const google_user = (await response.json()) as {
        sub: string;
        email: string;
        name?: string;
        picture?: string;
      };

      const users = await get_users_collection();

      let user = await users.findOne({
        google_id: google_user.sub,
      });

      if (!user) {
        user = await users.findOne({
          email: google_user.email,
        });
      }

      if (!user) {
        const now = new Date();

        const new_user = {
          username: google_user.name,
          company_name: '',
          google_id: google_user.sub,
          email: google_user.email,
          role: 'USER' as const,
          created_at: now,
          updated_at: now,
        };

        const result = await users.insertOne(new_user);

        user = {
          ...new_user,
          _id: result.insertedId,
        };
      } else if (!user.google_id) {
        await users.updateOne(
          { _id: user._id },
          {
            $set: {
              google_id: google_user.sub,
              updated_at: new Date(),
            },
          },
        );
      }

      const jwt_token = await app.jwt.sign({
        user_id: user._id!.toString(),
        username: user.username,
        role: user.role,
      });

      const env = loadEnv();

      reply.setCookie('torfun_token', jwt_token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.redirect('http://localhost:3000/dashboard');
    } catch (error) {
      app.log.error(error);

      return reply.code(500).send({
        message: 'Google authentication failed',
      });
    }
  });

  // Registration route
  app.post('/register', async (request, reply) => {
    const result = register_schema.safeParse(request.body);

    if (!result.success) {
      return reply.code(400).send({
        message: 'Invalid registration data',
        errors: result.error.flatten(),
      });
    }

    const { username, password, company_name } = result.data;

    const users = await get_users_collection();

    const existing_user = await users.findOne({
      username,
    });

    if (existing_user) {
      return reply.code(409).send({
        message: 'Username already exists',
      });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const now = new Date();

    const user = {
      username,
      password_hash,
      company_name,
      role: 'USER' as const,
      created_at: now,
      updated_at: now,
    };

    const result_insert = await users.insertOne(user);

    const token = await app.jwt.sign({
      user_id: result_insert.insertedId.toString(),
      username,
      role: user.role,
    });

    reply.setCookie('torfun_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.code(201).send({
      message: 'Registration successful',
      user: {
        id: result_insert.insertedId.toString(),
        username,
        company_name,
        role: user.role,
      },
    });
  });

  // Login route
  const login_schema = z.object({
    username: z.string(),
    password: z.string(),
  });

  app.post('/login', async (request, reply) => {
    const result = login_schema.safeParse(request.body);

    if (!result.success) {
      return reply.code(400).send({
        message: 'Invalid login data',
      });
    }

    const { username, password } = result.data;

    const users = await get_users_collection();

    const user = await users.findOne({
      username,
    });

    if (!user || !user.password_hash) {
      return reply.code(401).send({
        message: 'Invalid username or password',
      });
    }

    const password_valid = await bcrypt.compare(password, user.password_hash);

    if (!password_valid) {
      return reply.code(401).send({
        message: 'Invalid username or password',
      });
    }

    const token = await app.jwt.sign({
      user_id: user._id!.toString(),
      username: user.username,
      role: user.role,
    });

    reply.setCookie('torfun_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.send({
      message: 'Login successful',
      user: {
        id: user._id!.toString(),
        username: user.username,
        company_name: user.company_name,
        role: user.role,
      },
    });
  });

  // Logout route
  app.post('/logout', async (_request, reply) => {
    reply.clearCookie('torfun_token', {
      path: '/',
    });

    return reply.send({
      message: 'Logout successful',
    });
  });

  // Get current user route
  app.get('/me', async (request, reply) => {
    try {
      await request.jwtVerify();

      const users = await get_users_collection();

      const user = await users.findOne({
        _id: new ObjectId(request.user.user_id),
      });

      if (!user) {
        return reply.code(404).send({
          message: 'User not found',
        });
      }

      return {
        id: user._id!.toString(),
        username: user.username,
        company_name: user.company_name,
        role: user.role,
      };
    } catch {
      return reply.code(401).send({
        message: 'Unauthorized',
      });
    }
  });
}
