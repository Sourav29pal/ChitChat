import jwt from "jsonwebtoken";

import User from "../model/user.model.js";

const secureRoute = async (req, res, next) => {
  try {
    const token =
      req.cookies?.jwt ||
      (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : null);

    if (!token || token === "undefined") {
      return res.status(401).json({ error: "No token, authorization denied" });
    }
    const secretKey = process.env.JWT_SECRET;
    if (!secretKey) {
      throw new Error("FATAL: JWT_SECRET environment variable is not defined. Cannot verify JWT tokens.");
    }
    const decoded = jwt.verify(token, secretKey);
    if (!decoded) {
      return res.status(401).json({ error: "Invalid Token" });
    }
    const user = await User.findById(decoded.userId).select("-password"); // current loggedin user
    if (!user) {
      return res.status(401).json({ error: "No user found" });
    }
    req.user = user;
    next();
  } catch (error) {
    console.log("Error in secureRoute: ", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
export default secureRoute;