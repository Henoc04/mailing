import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { createUser, findByEmail } from "../src/services/user.service";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@mailing.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const fullName = process.env.SEED_ADMIN_NAME ?? "Administrateur";

  const existing = await findByEmail(email);
  if (existing) {
    console.log(`Le compte administrateur ${email} existe déjà, aucune action.`);
    return;
  }

  await createUser({ email, password, fullName, role: "ADMIN" });
  console.log(`Compte administrateur créé : ${email}`);
  console.log("Pensez à changer ce mot de passe après la première connexion.");
}

main()
  .catch((err) => {
    console.error("Erreur lors du seed :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
