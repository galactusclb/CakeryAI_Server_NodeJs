const mysql = require("mysql");
const moment = require("moment");
const bcrypt = require("bcryptjs");

require("dotenv").config();

const pool = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	port: process.env.DB_PORT,
});

let db = {};

db.findOneUser = (data) => {
	return new Promise((resolve, reject) => {
		where = "";
		params = [data["userName"]];

		if (data["email"]) {
			where = "OR email=?";
		}
		pool.query(
			"SELECT userId,userName,email FROM users WHERE userName=?" + where,
			params,
			(err, results) => {
				if (err) {
					return reject(err);
				} else {
					if (results.length > 0) {
						return resolve(true);
					} else {
						return resolve(false);
					}
				}
			}
		);
	});
};

db.findUserName = (data) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"SELECT email FROM users WHERE userName=? ",
			[data["userName"]],
			(err, results) => {
				if (err) {
					return reject(err);
				}
				resolve(results);
			}
		);
	});
};

db.findUserById = (user) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"SELECT userId,userName,email FROM users WHERE userId=? LIMIT 1",
			[user._uid],
			(err, results) => {
				if (err) {
					console.log(err);
					reject(err);
				}

				resolve(results);
			}
		);
	});
};

db.registerUser = (data, hashpassword, token, expireToken) => {
	const timestamp = moment().format();

	return new Promise((resolve, reject) => {
		pool.query(
			"INSERT INTO users (status) VALUES ( ? ) ",
			[1],
			(err, results) => {
				if (err) {
					console.log(err);
					return reject("Server Error");
				}

				const inserted_id = results.insertId;
				const fu = paddy(inserted_id, 6);

				const new_id = "U" + fu;

				pool.query(
					"UPDATE users SET userId=?,userName=?,email=?,password=?,companyName=?,userRole=?,token=?,expireToken=?,isConfirm=?,regTimestamp=? WHERE _id = ?",
					[
						new_id,
						data["userName"],
						data["email"],
						hashpassword,
						data["companyName"],
						"user",
						token,
						expireToken,
						0,
						timestamp,
						inserted_id,
					],
					(err, results) => {
						if (err) {
							reject(err);
						}
						resolve(results);
					}
				);

				// 'INSERT INTO users(userName,email,password,companyName,token,regTimestamp,status) VALUES(?,?,?,?,?,?,?)',
				// [data['userName'],data['email'],hashpassword,data['companyName'],data['token'],timestamp, '1'],
				// (err,results)=>{

				//     if (err) {
				//         // console.log(err);
				//         return reject(err)
				//     }
				//     return resolve(results);
			}
		);
	});
};

db.loginUser = (uName, uPass) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"SELECT userId,userName,email,password,userRole,isConfirm,status FROM users WHERE userName=? OR email=? LIMIT 1",
			[uName, uName],
			async (err, results) => {
				if (err) {
					console.log(err);

					return reject({
						code: 500,
						status: "Something went wrong.Please try again later.",
					});
				} else {
					if (results.length == 0) {
						return reject({
							code: 404,
							status: "No Username found",
						});
					}
					if (results.length > 0 && results[0].status == 0) {
						return reject({
							code: 401,
							status:
								"This account is blocked. Please contact an administrator.",
						});
					}
					if (
						results.length > 0 &&
						results[0].status == 1 &&
						results[0].isConfirm == 0
					) {
						return reject({
							code: 401,
							status: "verify your account.",
						});
					} else {
						const isMatch = await bcrypt.compare(uPass, results[0].password);

						if (isMatch == true) {
							var tt = [];
							ress = {
								id: results[0].userId,
								userName: results[0].userName,
								role: results[0].userRole,
							};
							// console.log(results[0].uName)
							tt.push(ress);

							return resolve(tt);
						} else {
							// status = 'Invalid Username/email or Password.';
							return reject({
								code: 401,
								status: "Invalid Username/email or Password.",
							});
						}
					}
				}
			}
		);
	});
};

db.confirmEmail = (token) => {
	const now = Date.now();
	return new Promise((resolve, reject) => {
		pool.query(
			"SELECT userId,email,token,expireToken FROM users WHERE token=? AND expireToken > ? LIMIT 1",
			[token, now],
			(err, results) => {
				if (err) {
					return reject(err);
				} else {
					if (results.length > 0) {
						pool.query(
							"UPDATE users SET isConfirm=?,token=?,expireToken=? WHERE userId=?",
							[1, null, null, results[0].userId],
							(err, results) => {
								if (err) {
									return reject(err);
								}
								return resolve(true);
							}
						);
					} else {
						return resolve(false);
					}
				}
				// }
				//return resolve(results);
			}
		);
	});
};

db.forgetPassword = (details) => {
	return new Promise((resolve, reject) => {
		var sql = "UPDATE users SET token=?,expireToken=? WHERE userName = ?";
		params = [details["token"], details["expireToken"], details["userName"]];

		var gg = pool.query(sql, params, (err, results) => {
			if (err) {
				reject(err);
			}
			// console.log(gg.sql)
			resolve(results);
		});
	});
};

db.resetPassword = (details) => {
	return new Promise((resolve, reject) => {
		// const now = moment().format();
		const now = Date.now();

		pool.query(
			"SELECT _id,userId FROM users WHERE uName = ? AND token=? AND expireToken > ? LIMIT 1",
			[details["user"], details["token"], now],
			(err, results) => {
				if (err) {
					console.log(err);
					return reject({ status: 500, message: "Server Error" });
				}

				if (results.length == 0) {
					return reject({ status: 422, message: "Token is not valid." });
				} else {
					const inserted_id = results[0].userId;

					pool.query(
						"UPDATE users SET password=?,token=?,tokenExp=? WHERE userId = ?",
						[details["hashpassword"], null, null, inserted_id],
						(err, results) => {
							if (err) {
								console.log(err);
								reject({ status: 500, message: "Server Error" });
							}
							resolve(results);
						}
					);
				}
			}
		);
	});
};

db.getUserDetails = (user) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"SELECT userName,email,fname,lname,phoneNumber,companyName FROM users WHERE userId=? LIMIT 1",
			[user._uid],
			(err, results) => {
				if (err) {
					console.log(err);
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

db.updateUserName = (user, data) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"UPDATE users SET userName=? WHERE userId=?",
			[data["userName"], user._uid],
			(err, results) => {
				if (err) {
					console.log(err);
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

db.updateUserPersonalDetails = (user, data) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"UPDATE users SET fname=?,lname=?,phoneNumber=?,companyName=? WHERE userId=?",
			[
				data["fname"],
				data["lname"],
				data["phoneNumber"],
				data["companyName"],
				user._uid,
			],
			(err, results) => {
				if (err) {
					console.log(err);
					reject(err);
				}
				resolve(results);
			}
		);
	});
};
// end of user account api dp

db.uploadReport = (file, user, body) => {
	console.log(body);
	return new Promise((resolve, reject) => {
		pool.query(
			"INSERT INTO uploadedReport(userId,uploadedFile,fileURL,file_key,headers,lastMonthDetails,accuracy,activate,status,timestamp) VALUES(?,?,?,?,?,?,?,?,?,?)",
			[
				user._uid,
				file.originalname,
				file.location,
				file.key,
				body.headers,
				body.lastMonthDetails,
				"Not available",
				null,
				"Initial",
				moment().format(),
			],
			(err, results) => {
				if (err) {
					reject(err);
				}

				resolve(results);
			}
		);
	});
};

db.getUploadedReportsByUserId = (data) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"SELECT * FROM uploadedreport WHERE userId=? ORDER BY timestamp ",
			[data._uid],
			(err, results) => {
				if (err) {
					console.log(err);
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

db.deleteReport = (user, data) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"DELETE FROM uploadedreport WHERE userId=? AND file_key=?",
			[user._uid, data.key],
			(err, results) => {
				if (err) {
					console.log(err);
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

db.changeReportsActiveSettings = (user, data) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"UPDATE uploadedreport SET activate=? WHERE _id=? AND userId=?",
			[data.active, data._id, user._uid],
			(err, results) => {
				if (err) {
					console.log(err);
					reject(err);
				}
				pool.query(
					"UPDATE uploadedreport SET activate=0 WHERE userId=? AND NOT _id=? ",
					[user._uid, data._id],
					(err, results) => {
						if (err) {
							console.log(err);
							reject(err);
						}
						resolve(results);
					}
				);
			}
		);
	});
};

db.trainModel = (user, data) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"UPDATE uploadedreport SET status=? WHERE _id=? AND userId=?",
			["training", data._id, user._uid],
			(err, results) => {
				if (err) {
					console.log(err);
					reject(err);
				}

				resolve(results);
			}
		);
	});
};

// *************** ingredients db functions **********//

db.addIngredientsDetails = (user, data) => {
	const now = moment().format();
	return new Promise((resolve, reject) => {
		pool.query(
			"INSERT INTO product_ingredients(_userId,ingredients_details,measure_type,timestamp) VALUES(?,?,?,?)",
			[user._uid, data["ingredientName"], data["measureType"], now],
			(err, results) => {
				if (err) {
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

db.getIngredientsDetails = (user) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"SELECT * FROM product_ingredients WHERE _userId=?",
			[user._uid],
			(err, results) => {
				if (err) {
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

// *************** Products db functions **********//

db.addproductsdetails = (user, data) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"INSERT INTO products(userId,productName,Ingredient,timestamp) VALUES(?,?,?,?)",
			[
				user._uid,
				data["productName"],
				JSON.stringify(data["ingredient"]),
				moment().format(),
			],
			(err, results) => {
				if (err) {
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

db.updateproduct = (user, data) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"UPDATE products SET productName=?, Ingredient=? WHERE _id=? AND userId=?",
			[
				data["productName"],
				JSON.stringify(data["ingredient"]),
				data["_id"],
				user._uid,
			],
			(err, results) => {
				if (err) {
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

db.deleteproduct = (user, productId) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"DELETE FROM products WHERE _id=? AND userId=?",
			[productId, user._uid],
			(err, results) => {
				if (err) {
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

db.getproductsdetails = (user) => {
	return new Promise((resolve, reject) => {
		console.log("userId", user._uid);
		pool.query(
			"SELECT * FROM products WHERE userId=?",
			[user._uid],
			(err, results) => {
				if (err) {
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

db.getproductsName = (user) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"SELECT _id,productName FROM products WHERE userId=?",
			[user._uid],
			(err, results) => {
				if (err) {
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

db.getproductdetailsbyproduct = (user, productId) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"SELECT * FROM products WHERE userId=? AND _id=?",
			[user._uid, productId],
			(err, results) => {
				if (err) {
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

db.getActivatedModelDetails = (user) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"SELECT _id,uploadedFile,headers,lastMonthDetails,status FROM uploadedreport WHERE activate=? AND userId=?",
			[1, user._uid],
			(err, results) => {
				if (err) {
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

// *************** predict django api data db function ********* //

db.getReportDetailsForPrediction = (user) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"SELECT fileURL,headers FROM uploadedreport WHERE userId=? AND activate=?",
			[user._uid, 1],
			(err, results) => {
				if (err) {
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

db.getReportDetailsForPredictionByreportID = (user, reportID) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"SELECT fileURL,headers FROM uploadedreport WHERE userId=? AND _id=?",
			[user._uid, reportID],
			(err, results) => {
				if (err) {
					reject(err);
				}
				resolve(results);
			}
		);
	});
};

db.getAllUsersActivatedReport = () => {
	return new Promise((resolve, reject) => {
		pool.query(
			"SELECT us.userId,us.userName,us.email,ud._id AS salesReportId, ud.fileURL, ud.headers FROM users as us \
			INNER JOIN uploadedreport as ud ON us.userId = ud.userId AND ud.activate = 1",
			[],
			(err, results) => {
				if (err) {
					reject(err);
				}

				resolve(results);
			}
		);
	});
};

db.generatedMonthlyReportLog = (details) => {
	console.log("details", details);
	return new Promise((resolve, reject) => {
		pool.query(
			"INSERT INTO generated_monthly_summary(userId,salesReportId,predicted_sales,month,timestamp) VALUES(?,?,?,?,?)",
			[
				details["userId"],
				details["salesReportId"],
				details["prediction"],
				Date.now(),
				Date.now(),
			],
			(err, results) => {
				if (err) {
					reject(err);
				}

				resolve(results);
			}
		);
	});
};

// error log
db.errorLog = (details) => {
	return new Promise((resolve, reject) => {
		pool.query(
			"INSERT INTO errorlog(timestamp,api_route,error_status,error) VALUES(?,?,?,?)",
			[],
			(err, results) => {
				if (err) {
					console.log(err);
					reject(err);
				}

				resolve(results);
			}
		);
	});
};

//**************** extra function **************//
function paddy(num, padlen, padchar) {
	var pad_char = typeof padchar !== "undefined" ? padchar : "0";
	var pad = new Array(1 + padlen).join(pad_char);
	return (pad + num).slice(-pad.length);
}

module.exports = db;
