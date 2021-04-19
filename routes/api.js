const express = require("express");
const moment = require("moment");
const http = require("http");
const https = require("https");
const url = require("url");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const sendgridTranspoter = require("nodemailer-sendgrid-transport");

require("dotenv").config();

const db = require("../db/db");
const awsMethods = require("../services/file-upload");
const template_notifyTrainingComplete = require("./email_notifyTrainingComplete");

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

router.put("/trainmodel", verifyToken(), async (req, res) => {
	try {
		const results = await db.trainModel(req.loggedUserDetails, req.body);

		// .then((result) => {
		// 	if (result) {
		// 		//get user email
		// 		const user = await db.findUserById(req.loggedUserDetails);

		// 		//send notification
		// 		transpoter.sendMail({
		// 			to: user[0].email,
		// 			from: fromEmail,
		// 			subject: "[Cakery.Ai] Your model has been trained successfully.",
		// 			html: template_notifyTrainingComplete.notifyTrainingComplete(
		// 				user[0].userName,
		// 				frontEndUrl
		// 			),
		// 		});

		res.status(200).json({
			message: "Your model is training now.",
		});

		// 	}
		// }).catch((err) => {
		// 	console.log(err);
		// 	res.status(409).send("Something wrong!");
		// });
	} catch (error) {
		res.status(400).json({ message: "server error" });
	}
});

//ingredients details api functions
router.post("/addingredientsdetails", verifyToken(), async (req, res) => {
	// console.log(req.loggedUserDetails);
	console.log(req.body);
	try {
		const result = db.addIngredientsDetails(req.loggedUserDetails, req.body);

		res.status(200).json({ message: "Ingredient details added successfully" });
	} catch (error) {
		res.status(500).json({ message: "internel server error" });
	}
});

router.get("/getingredientsdetails", verifyToken(), async (req, res) => {
	// console.log(req.loggedUserDetails);
	try {
		const result = await db.getIngredientsDetails(req.loggedUserDetails);

		// if (result?.[0]?.ingredients_details) {
		// 	result[0].ingredients_details = JSON.parse(
		// 		result?.[0]?.ingredients_details
		// 	);

		res.status(200).json(result);
		// }
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

// *************** Products Routes functions **********//

router.post("/addproductsdetails", verifyToken(), async (req, res) => {
	try {
		const result = await db.addproductsdetails(req.loggedUserDetails, req.body);
		res.status(200).json(result);
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

router.get("/getproductsdetails", verifyToken(), async (req, res) => {
	try {
		const result = await db.getproductsdetails(req.loggedUserDetails);

		res.status(200).json(result);
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

router.get("/getproductsname", verifyToken(), async (req, res) => {
	try {
		const result = await db.getproductsName(req.loggedUserDetails);

		res.status(200).json(result);
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

router.get(
	"/getproductdetailsbyproduct/:id",
	verifyToken(),
	async (req, res) => {
		try {
			const result = await db.getproductdetailsbyproduct(
				req.loggedUserDetails,
				req.params.id
			);
			res.status(200).json(result);
		} catch (error) {
			console.log(error);
			res.status(500).json({ message: "internel server errorss" });
		}
	}
);

router.post("/updateproduct", verifyToken(), async (req, res) => {
	try {
		await db.updateproduct(req.loggedUserDetails, req.body);

		res
			.status(200)
			.json({ message: "The product has been successfully updated" });
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

router.get("/deleteproduct/:productId", verifyToken(), async (req, res) => {
	try {
		const result = await db.deleteproduct(
			req.loggedUserDetails,
			req.params["productId"]
		);
		res.status(200).json(result);
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

router.get("/getactivatedmodeldetails", verifyToken(), async (req, res) => {
	// console.log(req.loggedUserDetails);
	try {
		const result = await db.getActivatedModelDetails(req.loggedUserDetails);
		res.status(200).json(result);
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

router.get("/getPredictonsByMonth", async (req, res) => {
	// console.log(req.loggedUserDetails);
	try {
		// const result = await db.getPredictonsByMonth(
		// 	req.loggedUserDetails,
		// 	req.query
		// );

		// const requestUrl = url.parse(url.format({
		// 	protocol: 'http',
		// 	hostname: host,
		// 	pathname: path,
		// 	port: port,
		// 	query: queryString
		// }));

		const requestUrl = url.parse(
			url.format({
				protocol: "http",
				hostname: "localhost",
				port: 8000,
				pathname: "/app/getPredictionEduraca",
				query: {
					q: 4,
				},
			})
		);
		// console.log(url.format(requestUrl));
		const req = http
			.get(url.format(requestUrl), (resp) => {
				let data = "";

				// A chunk of data has been received.
				resp.on("data", (chunk) => {
					console.log("GET chunk: " + chunk);
					data += chunk;
				});

				// The whole response has been received. Print out the result.
				resp.on("end", () => {
					res.status(200).json(JSON.parse(data));
				});
			})
			.on("error", (err) => {
				console.log("GET Error 1: " + err);
				res.status(500).json({ message: "internel server errorss" });
			});

		// https
		// 	.get("http://127.0.0.1:8000/app/getPredict", (resp) => {
		// 		let data = "";

		// 		// A chunk of data has been received.
		// 		resp.on("data", (chunk) => {
		// 			data += chunk;
		// 		});

		// 		// The whole response has been received. Print out the result.
		// 		resp.on("end", () => {
		// 			console.log(data);
		// 			res.status(200).json(data);
		// 		});
		// 	})
		// 	.on("error", (err) => {
		// 		console.log("Error: " + err.message);
		// 		res.status(500).json({ message: "internel server errors" });
		// 	});
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

router.get("/getSalesReport", async (req, res) => {
	try {
		// const requestUrl = url.parse(
		// 	url.format({
		// 		protocol: "http",
		// 		hostname: "localhost",
		// 		port: 8000,
		// 		pathname: "/app/getPredictionEduraca",
		// 		query: {
		// 			q: 4,
		// 		},
		// 	})
		// );
		// console.log(url.format(requestUrl));

		const req = https
			.get(
				"https://cakery-ai-s3.s3-ap-southeast-1.amazonaws.com/CakeMonthlySaleReport.csv",
				(resp) => {
					let data = "";

					// A chunk of data has been received.
					resp.on("data", (chunk) => {
						// console.log("GET chunk: " + chunk);
						data += chunk;
					});

					// The whole response has been received. Print out the result.
					resp.on("end", () => {
						// console.log(data);
						res.status(200).json(data);
					});
				}
			)
			.on("error", (err) => {
				console.log("GET Error: " + err);
				res.status(500).json({ message: "internel server error : aws" });
			});
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

module.exports = router;
