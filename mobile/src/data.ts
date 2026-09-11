import { art } from "./assets";
export const purple = "#6952FF";
export const books = [
  ["mexican", "Mexican Gothic", "Silvia Moreno-Garcia"],
  ["murder", "Murder Board", "Brian Shea"],
  ["burning", "A Burning", "Megha Majumdar"],
  ["immortal", "The Immortalists", "Chloe Benjamin"],
  ["olive", "Olive, Again", "Elizabeth Strout"],
  ["gold", "How Much of These Hills Is Gold", "C Pam Zhang"],
  ["red", "Red at the Bone", "Jacqueline Woodson"],
  ["bestiary", "Bestiary", "K-Ming Chang"],
  ["love", "Love in the Time of Cholera", "Gabriel García Márquez"],
  ["rain", "Fifty Words for Rain", "Asha Lemmie"],
  ["ready", "Ready Player Two", "Ernest Cline"],
  ["invisible", "Invisible Girl", "Lisa Jewell"],
  ["flies", "Lord of the Flies", "William Golding"],
  ["kevin", "We Need to Talk About Kevin", "Lionel Shriver"],
  ["carrion", "Carrion Comfort", "Dan Simmons"],
].map(([id, title, author]) => ({
  id,
  title,
  author,
  image: art[id as keyof typeof art],
}));
export type Book = (typeof books)[number];
export const categories = [
  "Arts",
  "Biographies",
  "Business",
  "Comic",
  "Cooking",
  "Edu",
  "Health",
  "History",
  "Horror",
  "Kid",
  "Medical",
  "Romance",
  "Fantasy",
  "Self-Help",
  "Sport",
  "Travel",
];
export const friends = [
  "Mona Chalabi",
  "Mark Smith",
  "Patricia Williams",
  "Mary Johnson",
  "Linda Lee",
];
export const collections = [
  "Self help book",
  "Viet Nam book",
  "Romantic",
  "Bao vui ;)",
  "Book for designer",
  "Want to Read",
  "Purchased book",
  "Finished",
  "Audiobook",
];
export const excerpt =
  "But I must explain to you how all this mistaken idea of denouncing pleasure and praising pain was born and I will give you a complete account of the system, and expound the actual teachings of the great explorer of the truth, the master-builder of human happiness. No one rejects, dislikes, or avoids pleasure itself, because it is pleasure, but because those who do not know how to pursue pleasure rationally encounter consequences that are extremely painful. Nor again is there anyone who loves or pursues or desires to obtain pain of itself, because it is pain, but because occasionally circumstances occur in which toil and pain can procure him some great pleasure. To take a trivial example, which of us ever undertakes laborious physical exercise, except to obtain some advantage from it? But who has any right to find fault with a man who chooses to enjoy a pleasure that has no annoying consequences, or one who avoids a pain that produces no resultant pleasure?";
