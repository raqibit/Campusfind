import bcrypt from "bcryptjs";
import { connectDatabase } from "./config/database.js";
import { University } from "./models/university.js";
import { User } from "./models/user.js";

async function seed() {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedPassword || seedPassword.length < 12) {
    throw new Error("Set SEED_ADMIN_PASSWORD to a private value of at least 12 characters before seeding.");
  }

  await connectDatabase();
  const university = await University.findOneAndUpdate(
    { shortName: "UI" },
    {
      $setOnInsert: {
        name: "University of Ibadan",
        shortName: "UI",
        emailDomain: "stu.ui.edu.ng",
        campuses: ["Main Campus"],
        active: true,
      },
    },
    { upsert: true, new: true },
  );
  const passwordHash = await bcrypt.hash(seedPassword, 12);
  const admin = await User.findOneAndUpdate(
    { email: "admin@campusfind.local" },
    {
      $setOnInsert: {
        fullName: "CampusFind Administrator",
        email: "admin@campusfind.local",
        matricNumber: "ADMIN-DEMO-001",
        university: university._id,
        role: "admin",
        verified: true,
      },
      $set: { passwordHash },
    },
    { upsert: true, new: true },
  );
  console.log(`Seeded ${university.name} and admin ${admin.email}.`);
  process.exit(0);
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
