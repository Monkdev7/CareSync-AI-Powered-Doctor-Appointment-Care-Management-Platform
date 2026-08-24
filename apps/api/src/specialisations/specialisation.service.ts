import { prisma } from "../db.js";
import type {
  CreateSpecialisationInput,
  UpdateSpecialisationInput,
} from "./specialisation.schemas.js";

export async function createSpecialisation(input: CreateSpecialisationInput) {
  return prisma.specialisation.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
    },
  });
}

export async function listSpecialisations() {
  return prisma.specialisation.findMany({
    orderBy: { name: "asc" },
  });
}

export async function getSpecialisationById(id: string) {
  return prisma.specialisation.findUnique({ where: { id } });
}

export async function updateSpecialisation(
  id: string,
  input: UpdateSpecialisationInput
) {
  return prisma.specialisation.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && {
        description: input.description?.trim() || null,
      }),
    },
  });
}

export async function deleteSpecialisation(id: string) {
  return prisma.specialisation.delete({ where: { id } });
}
