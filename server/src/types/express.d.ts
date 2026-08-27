declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        universityId: string;
        role: "student" | "finder" | "admin";
      };
    }
  }
}

export {};
