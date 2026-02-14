declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      userId?: string;
      userRole?: 'user' | 'admin';
    }
  }
}

export {};
