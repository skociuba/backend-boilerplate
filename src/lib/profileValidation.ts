import { z } from "zod";

// Pusty string z formularza (np. wyczyszczone pole daty) = "brak wartości",
// czyli NULL w bazie — inaczej new Date("") dałoby Invalid Date, a "" w
// telefonie udawałoby, że user coś podał.
const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

// name żyje w users (to nazwa widoczna przy postach i w nawigacji), reszta
// w user_profiles — jeden formularz, jeden PUT, dwie tabele (patrz
// userProfileController.upsert). Bez PESEL-u: patrz migracja remove_pesel.
export const profileSchema = z.object({
  name: z.string().trim().min(1, "imię i nazwisko jest wymagane").max(255),
  date_of_birth: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "data w formacie RRRR-MM-DD")
      .refine((value) => !Number.isNaN(Date.parse(value)), "nieprawidłowa data")
      .refine((value) => new Date(value) <= new Date(), "data nie może być z przyszłości")
      .nullable()
      .optional()
  ),
  phone: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{6,20}$/, "nieprawidłowy numer telefonu")
      .nullable()
      .optional()
  ),
});

export type ProfileInput = z.infer<typeof profileSchema>;
