const express = require("express");
const moment = require("moment");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const sendgridTranspoter = require("nodemailer-sendgrid-transport");

require("dotenv").config();

const db = require("../db/db");
const awsMethods = require("../services/file-upload");

const { verifyToken } = require("./basicAuth");

const singleUpload = awsMethods.upload.single("report");

const router = express.Router();

const secretKey = process.env.PROD_SECRET_KEY;
const sendGridAPiKey = process.env.SendGridAPiKey;
const fromEmail = process.env.FromEmail;

const transpoter = nodemailer.createTransport(
	sendgridTranspoter({
		auth: {
			api_key: sendGridAPiKey,
		},
	})
);

router.get("/info", async (req, res) => {
	res.status(200).json({ message: moment().format() });
});

router.post(
	"/registerUser",
	async (req, res, next) => {
		// const errors = validationResult(req);

		try {
			// if (!errors.isEmpty()) {
			// 	console.log(errors);
			// 	res.status(422).send(errors);
			// } else {
			let savedUser = await db.findOneUser(req.body);

			if (savedUser) {
				return res.status(422).json("User already exists with that username.");
			} else {
				const saltRound = 10;
				const hashpassword = await bcrypt.hash(req.body.password, saltRound);

				try {
					crypto.randomBytes(32, async (err, buffer) => {
						if (err) {
							console.log(err);
						}
						const token = buffer.toString("hex");
						const expireToken = Date.now() + 24 * 60 * 60 * 1000;

						let result = await db
							.registerUser(req.body, hashpassword, token, expireToken)
							.then((results) => {
								if (results) {
									transpoter.sendMail({
										to: req.body.email,
										from: fromEmail,
										subject: "Welcome to Cakery AI",
										html: `
                                        <p>Let's confirm your email address</p>
                                        <span>User name : ${req.body.userName} </span>
                                        <h5>By clicking on the following link, you are confirming your email address.</h5>
                                        <a href="http://localhost:4200/confirm/${token}">Confirm Email Address</a>
                                        <br><span>This link will expire after 1 day</span>
                                        `,
									});
									// res.status(200).json({ message : 'Check your Email.'})
									res.status(200).json({
										message:
											"Congratulations, Your account has been successfully created.Check your Email.",
										type: "success",
									});
								}
							})
							.catch((err) => {
								console.log(err);
							});
					});
				} catch (error) {
					console.log(error);
					res
						.status(409)
						.json({ message: "Registraion failed.", type: "error" });
				}
			}
		} catch (error) {
			console.log(error);
		}
	}
	// }
);

router.post("/loginUser", async (req, res, next) => {
	try {
		let result = await db.loginUser(req.body.userName, req.body.password);

		if (result.length == 0) {
			result = "Username or Password is wrong :( ";
			res.status(200).send(result);
		} else {
			let payload = {
				_uid: result[0].id,
				userName: result[0].userName,
				role: result[0].role,
			};

			let jwtToken = jwt.sign(
				payload,
				secretKey,
				{ expiresIn: "5h" },
				(err, token) => {
					if (err) {
						console.log(err);
						res.status(500).json({
							message: "it seems like an internal server error.",
							error: "error",
						});
					} else {
						res.status(200).json({
							jwtToken: token,
							_uid: result[0].id,
							userName: result[0].userName,
							role: result[0].role,
							// expiresIn: 120,// 2min expire time
							expiresIn: 18000, //5hours in seconds
						});
					}
				}
			);
			// let jwtToken = jwt.sign(payload, secretKey, { expiresIn: "2m" }) // 2min expire time
		}
	} catch (error) {
		console.log(error);
		if (typeof error === "object") {
			res.status(error.code).json({
				message: error.status,
				error: error.code,
			});
		} else {
			res.status(401).json({
				message: "Invalid authentication credentials!",
				error: error,
			});
		}
	}
});

router.post("/confirmemail", async (req, res, next) => {
	try {
		await db.confirmEmail(req.body.token).then((result) => {
			if (result) {
				res.status(200).json({ message: "your account has been confirmed" });
			} else {
				res.status(400).json({ message: "the link has expired or invalid" });
			}
		});
	} catch (error) {
		console.log(error);
		res.sendStatus(500);
	}
});

router.get("/xd", verifyToken(), async (req, res) => {
	res.status(200).json({ message: "xd bn" });
});

//upload training reports
router.post("/upload-report", verifyToken(), async (req, res) => {
	// console.log(req.loggedUserDetails);
	singleUpload(req, res, (err) => {
		if (err) {
			console.log(err);
			return res
				.status(422)
				.json({ errors: { title: "File Upload Error", details: err.message } });
		}
		// console.log(req.body);
		const body = JSON.parse(JSON.stringify(req.body));

		const result = db.uploadReport(req.file, req.loggedUserDetails, body);

		if (result) {
			return res.status(200).json({ fileURL: req.file.location });
		} else {
			return res.status(400).send("bbad");
		}
	});
});

router.delete("/delete-report/:key", verifyToken(), async (req, res) => {
	try {
		const results = awsMethods.s3delete(req.params.key);

		if (results) {
			const Success = db.deleteReport(req.loggedUserDetails, req.params);
			if (Success) {
				res.status(200).json({ message: "file delete succesfully" });
			}
			res.status(200);
		}
	} catch (error) {
		console.log(error);
		res.send(400).json({ err: "server error" });
	}
});

router.get("/getuserreports", verifyToken(), async (req, res) => {
	try {
		// const results = await db.getUploadedReportsByUserId(req.query);
		const results = await db.getUploadedReportsByUserId(req.loggedUserDetails);
		res.status(200).json(results);
	} catch (error) {
		res.status(400).json({ message: "server error" });
	}
});

router.put("/changereportsactivesettings", verifyToken(), async (req, res) => {
	try {
		const results = await db.changeReportsActiveSettings(
			req.loggedUserDetails,
			req.body
		);
		res.status(200).json(results);
	} catch (error) {
		res.status(400).json({ message: "server error" });
	}
});

module.exports = router;
