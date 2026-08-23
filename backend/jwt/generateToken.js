import jwt from "jsonwebtoken";

const createTokenAndSaveCookie = (userId, res) => {
  const secretKey = process.env.JWT_SECRET;
  if (!secretKey) {
    throw new Error("FATAL: JWT_SECRET environment variable is not defined. Cannot sign JWT tokens.");
  }
  const token = jwt.sign({ userId }, secretKey, {
    expiresIn: "10d",
  });
  res.cookie("jwt", token, {
    httpOnly: true, // xss
    secure: false, // set to false for local development HTTP compatibility
    sameSite: "lax",
    path: "/",
  });
};
export default createTokenAndSaveCookie;