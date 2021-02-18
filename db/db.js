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
		pool.query(
			"SELECT userId,userName,email FROM users WHERE userName=? OR email=?",
			[data["userName"], data["email"]],
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

db.uploadReport = (file, user, body) => {
	console.log(file);
	return new Promise((resolve, reject) => {
		pool.query(
			"INSERT INTO uploadedReport(userId,uploadedFile,fileURL,file_key,headers,selectedColumn,accuracy,activate,status,timestamp) VALUES(?,?,?,?,?,?,?,?,?,?)",
			[
				user._uid,
				file.originalname,
				file.location,
				file.key,
				body.headers,
				body.selectedColumn,
				"Not available",
				0,
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
		var gg = pool.query(
			"SELECT * FROM uploadedreport WHERE userId=?",
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

//**************** extra function **************//
function paddy(num, padlen, padchar) {
	var pad_char = typeof padchar !== "undefined" ? padchar : "0";
	var pad = new Array(1 + padlen).join(pad_char);
	return (pad + num).slice(-pad.length);
}

module.exports = db;
