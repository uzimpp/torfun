import type { ObjectId } from 'mongodb';

export type UserRole = 'USER' | 'ADMIN';

export interface User {
  _id?: ObjectId;
  username: string;
  password_hash?: string;
  company_name: string;
  role: UserRole;
  google_id?: string;
  email?: string;
  created_at: Date;
  updated_at: Date;
}
