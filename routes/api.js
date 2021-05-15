const express = require("express");
const moment = require("moment");
const asyncNpm = require("async");
const http = require("http");
const https = require("https");
const url = require("url");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const csv = require("csvtojson");
const nodemailer = require("nodemailer");
const { check, validationResult } = require("express-validator");
const sendgridTranspoter = require("nodemailer-sendgrid-transport");

require("dotenv").config();

const db = require("../db/db");
const awsMethods = require("../services/file-upload");
const template_reset_password = require("./tempForgetPasswordEmail");
const template_Monthly_Predict_Report = require("./tempMonthlyPredictReport");

const { verifyToken } = require("./basicAuth");
const {
	getSalesReport,
	getPredictionBySalesreport,
	pro_trainModel,
	pro_getPrediction,
} = require("./predictAPIFunct");

const { examineTrainedModelURL } = require("./extraFunctions");

const singleUpload = awsMethods.upload.single("report");

const router = express.Router();

const secretKey = process.env.PROD_SECRET_KEY;
const sendGridAPiKey = process.env.SendGridAPiKey;
const fromEmail = process.env.FromEmail;

const frontEndUrl = process.env.FrontEndUrl;

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

			console.log(req.body);
			let savedUser = await db.findOneUser(req.body);

			if (savedUser) {
				return res
					.status(422)
					.json("User already exists with that username/email.");
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

router.post(
	"/forgetpassword",
	[
		check("userName")
			.not()
			.isEmpty()
			.withMessage("Username is empty")
			.trim()
			.escape(),
	],
	async (req, res, next) => {
		const errors = validationResult(req);

		if (!errors.isEmpty()) {
			console.log(errors);
			res.status(422).send(errors);
		} else {
			let savedUser = await db.findUserName(req.body);

			if (!savedUser) {
				// for wrong users
				return res.status(422).json("No user account found for that username.");
			} else {
				data = req.body;

				try {
					crypto.randomBytes(32, async (err, buffer) => {
						if (err) {
							console.log(err);
						}
						const token = buffer.toString("hex");
						const expireToken = Date.now() + 5 * 60 * 60 * 1000;

						data.token = token;
						data.expireToken = expireToken;

						let result = await db
							.forgetPassword(data)
							.then((result) => {
								if (result) {
									transpoter.sendMail(
										{
											// to: req.body.email,
											to: savedUser[0].email,
											from: fromEmail,
											subject: "[CakeryAi.com] Reset your password",
											html: template_reset_password.resetPassword(
												req.body["userName"],
												frontEndUrl,
												token
											),
										},
										(error, response) => {
											if (error) {
												console.log(error);
											}
											res.status(200).json({
												message:
													"If you are an admin,you will get a mail to the Admin's email.",
											});
										}
									);
								}
							})
							.catch((err) => {
								console.log(err);
								res.status(409).send("Something wrong!");
							});
					});
				} catch (error) {
					console.log(error);
					res.status(409).send("Something wrong!");
				}
			}
		}
	}
);

router.post(
	"/resetpassword",
	[
		check("newPassword")
			.exists()
			.withMessage("Password should not be empty")
			.matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,13}$/, "i")
			.withMessage(
				"Please enter a password at least 8 to 13 characters and contain at least one uppercase, at least one lowercase character, and one special character."
			),
		check("confirmPassword", "Passwords do not match").custom(
			(value, { req }) => value === req.body.newPassword
		),
	],
	async (req, res, next) => {
		const errors = validationResult(req);

		if (!errors.isEmpty()) {
			console.log(errors);
			res.status(422).send(errors);
		} else {
			data = req.body;

			if (data.newPassword !== data.confirmPassword) {
				res
					.status(422)
					.json({ error: "new password and confirm password is not same" });
			} else {
				const saltRound = 10;
				const hashpassword = await bcrypt.hash(data.newPassword, saltRound);

				data.hashpassword = hashpassword;

				try {
					const results = await db.resetPassword(data);
					res.status(200).json({
						message: "Your password has been changed.",
					});
				} catch (error) {
					console.log(error);
					res
						.status(error.status || 422)
						.send(error.message || "Something wrong!");
				}
			}
		}
	}
);

router.get("/getuserdetails", verifyToken(), async (req, res) => {
	try {
		// const results = await db.getUploadedReportsByUserId(req.query);
		const results = await db.getUserDetails(req.loggedUserDetails);
		res.status(200).json(results);
	} catch (error) {
		res.status(400).json({ message: "server error" });
	}
});

router.post("/checkusername", verifyToken(), async (req, res) => {
	try {
		let savedUser = await db.findUserName(req.body);

		if (savedUser.length > 0) {
			res
				.status(422)
				.json({ message: "User already exists with that username." });
		} else {
			res.status(200).json({ message: "This name is available" });
		}
	} catch (error) {
		res.status(500).json({ message: "server error" });
	}
});

router.post("/updateusername", verifyToken(), async (req, res) => {
	try {
		let savedUser = await db.findUserName(req.body);

		if (savedUser.length > 0) {
			return res.status(422).json("User already exists with that username.");
		} else {
			await db.updateUserName(req.loggedUserDetails, req.body);

			res.status(200).json({ message: "Your username has been updated" });
		}
	} catch (error) {
		res.status(500).json({ message: "server error" });
	}
});

router.post("/updateuserpersonaldetails", verifyToken(), async (req, res) => {
	try {
		await db.updateUserPersonalDetails(req.loggedUserDetails, req.body);

		res.status(200).json({ message: "Your personal details has been updated" });
	} catch (error) {
		res.status(500).json({ message: "server error" });
	}
});
// end of user account api

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

router.get("/getPredictonsByMonth", verifyToken(), async (req, res) => {
	// console.log(req.loggedUserDetails);
	try {
		console.log("productID ", req.query);
		const result = await db.getReportDetailsForPrediction(
			req.loggedUserDetails
		);
		const headers = JSON.parse(result[0]?.["headers"]);

		if (headers.length) {
			headers.forEach((element) => {
				if (element["mappedProductID"] == req.query["productID"]) {
					result[0]["needPrediction"] = element["name"];
					// console.log(result[0]["needPrediction"]);
				}
			});
		}

		console.log(result[0]["needPrediction"]);
		if (!result[0]["needPrediction"]) {
			res.status(400).json({
				message:
					"This product has not been mapped with your activated sales report",
			});
		} else {
			console.log(result[0]);
			if (result[0]["fileURL"] && result[0]["needPrediction"]) {
				result[0]["monthsCount"] = req.query["months"] || 1;

				console.log(result);
				delete result[0].headers;
				const predictions = await getPredictionBySalesreport(result[0]);
				// res.status(200).json({ predictions: "d" });
				console.log("predictions : ", predictions);
				res.status(200).json(predictions);
			} else {
				res.status(404).json({
					message: "File url missing or the mapped section is not correct.",
				});
			}
		}
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

router.get("/getSalesReport", verifyToken(), async (req, res) => {
	try {
		const results = await db.getReportDetailsForPrediction(
			req.loggedUserDetails
		);

		if (results.length == 0 || !results[0]?.["fileURL"]) {
			res.status(404).json({ message: "Sales report not found" });
		} else {
			// .get(
			// 	"https://cakery-ai-s3.s3-ap-southeast-1.amazonaws.com/CakeMonthlySaleReport.csv",

			// .get(results[0]?.["fileURL"], (resp) => {
			//
			//

			const csvData = await getSalesReport(results[0]?.["fileURL"]);

			if (!csvData) {
			} else {
				res.status(200).json(csvData);
			}
		}
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

// testing
router.get("/getSalesReportCSV", async (req, res) => {
	try {
		// .get(
		// 	"https://cakery-ai-s3.s3-ap-southeast-1.amazonaws.com/CakeMonthlySaleReport.csv",

		// .get(results[0]?.["fileURL"], (resp) => {
		//
		//

		const csvData = await getSalesReport(req.query.url);

		if (!csvData) {
		} else {
			res.status(200).json(csvData);
		}
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

router.get("/getpreviousSaleswithpredict", verifyToken(), async (req, res) => {
	try {
		const results = await db.getReportDetailsForPrediction(
			req.loggedUserDetails
		);

		if (results.length == 0 || !results[0]?.["fileURL"]) {
			res.status(404).json({ message: "Sales report not found" });
		} else {
			const csvData = await getSalesReport(results[0]?.["fileURL"]);

			const headers = JSON.parse(results[0]?.["headers"]);

			headers.forEach((element) => {
				if (element["mappedProductID"] == req.query["productID"]) {
					results[0]["needPrediction"] = element["name"];
				}
			});
			// console.log(results);
			if (!csvData || !results[0]["needPrediction"]) {
				console.log("There is no csv data or mapped product");
				res
					.status(400)
					.json({ message: "There is no csv data or mapped product" });
			} else {
				const labels = [];
				const data = [];

				csvData.forEach((element) => {
					if (moment(element["Month"]).format("YYYY") == "2020") {
						labels.push(element["Month"]);
						data.push(element[results[0]["needPrediction"]]);
					}
				});
				res.status(200).json({ labels, data });
			}
		}
		// }
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

router.get("/getnextmonthpredict", verifyToken(), async (req, res) => {
	try {
		console.log("productID ", req.query);
		const result = await db.getReportDetailsForPrediction(
			req.loggedUserDetails
		);

		const headers = JSON.parse(result[0]?.["headers"]);

		if (headers.length) {
			headers.forEach((element) => {
				if (element["mappedProductID"] == req.query["productID"]) {
					result[0]["needPrediction"] = element["name"];
					// console.log(result[0]["needPrediction"]);
				}
			});
		}

		console.log(result[0]["needPrediction"]);
		if (!result[0]["needPrediction"]) {
			res.status(400).json({
				message:
					"This product has not been mapped with your activated sales report",
			});
		} else {
			console.log(result[0]);
			if (result[0]["fileURL"] && result[0]["needPrediction"]) {
				result[0]["monthsCount"] = 1;
				delete result[0].headers;

				const predictions = await getPredictionBySalesreport(result[0]);

				console.log("predictions : ", predictions);
				res.status(200).json(predictions);
			} else {
				res.status(404).json({
					message: "File url missing or the mapped section is not correct.",
				});
			}
		}
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

// pro users
router.get("/trainmodel", verifyToken(), async (req, res) => {
	try {
		// get file details
		const result = await db.getReportDetailsForPredictionByreportID(
			req.loggedUserDetails,
			req.query.reportID
		);

		// get mapped products list
		const headers = JSON.parse(result[0]?.["headers"]);

		needPrediction = [];

		if (headers.length) {
			headers.forEach((element) => {
				if (element["name"] != "Month") {
					needPrediction.push(element["name"]);
				}
			});
		}

		result[0]["needPrediction"] = needPrediction;

		console.log(result[0]["needPrediction"]);
		if (!result[0]["needPrediction"]) {
			res.status(400).json({
				message:
					"This product has not been mapped with your activated sales report",
			});
		} else {
			console.log(result[0]);
			if (result[0]["fileURL"] && result[0]["needPrediction"]) {
				result[0]["monthsCount"] = 1;
				delete result[0].headers;

				// update the file status untill training complete
				await db.updateProUsers_trainedModelStatus(
					req.loggedUserDetails,
					req.query.reportID,
					"training"
				);
				res.status(200).json({ message: "model is on training" });
				// call the django api for train the model
				const trainResults = await pro_trainModel(result[0]);

				if (trainResults.status < 200 || trainResults.status > 299) {
					res.status(trainResults.status).json(trainResults.message);
				} else {
					// save trained model url path in db
					await db.updateProUsers_trainedModelPaths(
						req.loggedUserDetails,
						req.query.reportID,
						trainResults["data"]
					);
				}
			} else {
				res.status(404).json({
					message: "File url missing or the mapped section is not correct.",
				});
			}
		}

		// res.status(200).json({
		// 	message: "Your model is training now.",
		// });
	} catch (error) {
		res.status(400).json({ message: "server error" });
	}
});

router.get("/getpredictionpro", verifyToken(), async (req, res) => {
	try {
		const result = await db.getReportDetailsForPrediction_Pro(
			req.loggedUserDetails
		);

		// const poductsList = await db.getproductsdetails(req.loggedUserDetails);

		console.log(req.query);

		console.log(result);

		const headers = JSON.parse(result[0]?.["headers"]);

		if (headers.length) {
			headers.forEach((element) => {
				if (element["mappedProductID"] == req.query["productID"]) {
					result[0]["needPrediction"] = element["name"];
					// console.log(result[0]["needPrediction"]);
					result[0]["trainedModelURL"] = element["name"];
				}
			});
		}
		console.log(result[0]["needPrediction"]);

		if (!result[0]["needPrediction"]) {
			res.status(400).json({
				message:
					"This product has not been mapped with your activated sales report",
			});
		} else {
			const modelURL = await examineTrainedModelURL(result[0]);
			console.log("examineTrainedModelURL with : ", modelURL);

			// console.log(result[0]);
			if (result[0]["fileURL"] && result[0]["needPrediction"]) {
				result[0]["monthsCount"] = 1;
				delete result[0].headers;

				// const predictions = await getPredictionBySalesreport(result[0]);
				const predictions = await pro_getPrediction(result[0]);

				console.log("predictions : ", predictions);
				res.status(200).json(predictions);
			} else {
				res.status(404).json({
					message: "File url missing or the mapped section is not correct.",
				});
			}
		}
	} catch (error) {
		console.log(error);
	}
});

// prediction emails

router.get("/sendmonthlysalesthroughemail", async (req, res) => {
	try {
		const result = await db.getAllUsersActivatedReport();
		console.log(result);

		var bar = new Promise((resolve, reject) => {
			const userProductList = [];
			result.forEach(async (element) => {
				const products = await db.getproductsdetails({
					_uid: element["userId"],
				});

				new Promise((resolve, reject) => {
					const neededProductsList = [];
					products.forEach((product) => {
						const headers = JSON.parse(element?.["headers"]);
						if (headers.length) {
							headers.forEach(async (header) => {
								if (header["mappedProductID"] == product["_id"]) {
									// element["needPrediction"] = header["name"];
									console.log(header["name"]);
									neededProductsList.push(header["name"]);
									console.log(neededProductsList);
								}
							});
							resolve();
						}
					});
					element["needPrediction"] = neededProductsList;
				}).then((results) => {
					console.log("neededProductsList", element);
					// res.status(200).json(results);
					delete element?.["headers"];
					callPredictApi(res, element);
				});
				// console.log(userProductList);
				resolve(userProductList);
			});
		}).then((results) => {
			console.log(results);
			res.status(200).json(results);
		});

		// const headers = JSON.parse(result[0]?.["headers"]);

		// if (headers.length) {
		// 	headers.forEach((element) => {
		// 		if (element["mappedProductID"] == req.query["productID"]) {
		// 			result[0]["needPrediction"] = element["name"];
		// 			// console.log(result[0]["needPrediction"]);
		// 		}
		// 	});
		// }

		// console.log(result[0]["needPrediction"]);
		// if (!result[0]["needPrediction"]) {
		// 	res.status(400).json({
		// 		message:
		// 			"This product has not been mapped with your activated sales report",
		// 	});
		// } else {
		// 	console.log(result[0]);
		// 	if (result[0]["fileURL"] && result[0]["needPrediction"]) {
		// 		result[0]["monthsCount"] = 1;
		// 		delete result[0].headers;

		// 		const predictions = await getPredictionBySalesreport(result[0]);

		// 		console.log("predictions : ", predictions);
		// 		res.status(200).json(predictions);
		// 	} else {
		// 		res.status(404).json({
		// 			message: "File url missing or the mapped section is not correct.",
		// 		});
		// 	}
		// }
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "internel server errorss" });
	}
});

router.get("/Automateemail", async (req, res) => {
	try {
		console.log(req.originalUrl);
		// part 1
		const result = await db.getAllUsersActivatedReport();
		console.log(result);
		// res.status(200).json(result);

		// part 2

		var bar = new Promise((resolve, reject) => {
			const userProductList = [];
			result.forEach(async (element) => {
				const products = await db.getproductsdetails({
					_uid: element["userId"],
				});

				new Promise((resolve, reject) => {
					const neededProductsList = [];
					products.forEach((product) => {
						const headers = JSON.parse(element?.["headers"]);
						if (headers.length) {
							headers.forEach(async (header) => {
								if (header["mappedProductID"] == product["_id"]) {
									// element["needPrediction"] = header["name"];
									console.log(header["name"]);
									neededProductsList.push(header["name"]);
									console.log(neededProductsList);
									// console.log(header["name"]);
									// // console.log(result[0]["needPrediction"])

									// // console.log("needPrediction", element["needPrediction"]);

									// if (!element["needPrediction"]) {
									// 	// res.status(400).json({
									// 	// 	message:
									// 	// 		"This product has not been mapped with your activated sales report",
									// 	// });

									// 	console.log("not mapped :", product["productName"]);
									// } else {
									// 	// console.log(element);
									// 	if (element["fileURL"] && element["needPrediction"]) {
									// 		element["monthsCount"] = 4;
									// 		console.log(element["fileURL"]);
									// 		// callPredictApi(element);
									// 		neededProductsList.push(element);
									// 	} else {
									// 		res.status(404).json({
									// 			message:
									// 				"File url missing or the mapped section is not correct.",
									// 		});
									// 	}
									// }
								}
							});
							resolve();
						}
					});
					element["needPrediction"] = neededProductsList;
				}).then((results) => {
					console.log("neededProductsList", element);
					// res.status(200).json(results);
					delete element?.["headers"];
					callPredictApi(res, element);
				});
				// console.log(userProductList);
				resolve(userProductList);
			});
		}).then((results) => {
			console.log(results);
			res.status(200).json(results);
		});
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "Error" });
	}
});

// function

function callPredictApi(res, element) {
	console.log("element  2 ", element);

	const requestUrl = url.parse(
		url.format({
			protocol: "http",
			hostname: "localhost",
			port: 8000,
			pathname: "/app/getMonthlyPrediction",
			query: {
				fileURL: element["fileURL"],
				needPrediction: JSON.stringify(element["needPrediction"]),
				monthsCount: 1,
			},
		})
	);

	// console.log(url.format(requestUrl));
	const edu = http
		.get(url.format(requestUrl), (resp) => {
			let data = "";

			// A chunk of data has been received.
			resp.on("data", (chunk) => {
				// console.log("GET chunk: " + chunk);
				data += chunk;
			});

			// The whole response has been received. Print out the result.
			resp.on("end", async () => {
				// res.status(200).json(JSON.parse(data));
				console.log(data);
				// output.push(JSON.parse(data));
				sendMonthlyEmails(element, data);
			});
		})
		.on("error", (err) => {
			// console.log("GET Error 1: " + err);
			res.status(500).json({ message: "internel server errorss" });
		});
}

function sendMonthlyEmails(element, predictions) {
	// console.log(element, JSON.parse(predictions));
	transpoter.sendMail(
		{
			// to: req.body.email,
			to: element["email"],
			from: fromEmail,
			subject: "[CakeryAi.com] Month prediction report",
			html: template_Monthly_Predict_Report.sendMail(
				element,
				frontEndUrl,
				JSON.parse(predictions)
			),
		},
		(error, response) => {
			if (error) {
				console.log("nodemain error ====", error);
				// db.errorLog(,error);
			} else {
				console.log("sucess");
				db.generatedMonthlyReportLog({
					userId: element["userId"],
					salesReportId: element["salesReportId"],
					prediction: predictions,
				});
			}
		}
	);
}

module.exports = router;
