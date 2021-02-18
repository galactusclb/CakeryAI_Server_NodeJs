const jwt = require("jsonwebtoken");
require("dotenv").config();

const secretKey = process.env.PROD_SECRET_KEY;

function verifyToken() {
	return (req, res, next) => {
		if (!req.headers.authorization) {
			return res.status(401).send("Unauthorized request-1");
		}

		let token = req.headers.authorization.split(" ")[1];

		if (token === "null") {
			return res.status(401).send("Unauthorized request-2");
		}

		try {
			let payload = jwt.verify(token, secretKey);

			// req.loggedUserDetails = payload.subject // this can use in next function
			req.loggedUserDetails = payload; // this can use in next function
			next();
		} catch (error) {
			console.error(error);
			return res.status(401).send("Unothorized request-3");
		}
	};
}

module.exports = {
	verifyToken,
};
