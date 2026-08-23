import jwt from "jsonwebtoken";

const createTokenAndSaveCookie = (userId, res) => {
  const secretKey = process.env.JWT_SECRET;

  if (!secretKey) {
    throw new Error(
      "FATAL: JWT_SECRET environment variable is not defined. Cannot sign JWT tokens."
    );
  }

  const token = jwt.sign({ userId }, secretKey, {
    expiresIn: "10d",
  });

  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("jwt", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  });
};

export default createTokenAndSaveCookie;