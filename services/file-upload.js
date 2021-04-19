const aws = require("aws-sdk");
const multer = require("multer");
const multerS3 = require("multer-s3");

require("dotenv").config();

aws.config.update({
	secretAccessKey: process.env.SECRETACCESSKEY,
	accessKeyId: process.env.ACCESSKEYID,
	region: process.env.REGION,
});

BUCKET_NAME = "cakery-ai-s3";

const s3 = new aws.S3();

let awsMethods = {};

const fileFilter = (req, file, cb) => {
	if (
		file.mimetype === "application/vnd.ms-excel" ||
		file.mimetype === "text/csv" ||
		file.mimetype === "application/csv"
	) {
		cb(null, true);
	} else {
		cb(new Error("Invalid Mime type, only csv and xls"), false);
	}
};

awsMethods.upload = multer({
	fileFilter: fileFilter,
	storage: multerS3({
		s3: s3,
		bucket: BUCKET_NAME,
		acl: "public-read",
		metadata: function (req, file, cb) {
			// console.log("xxxxxxxxxxx", file);
			cb(null, { fieldName: file.originalname });
		},
		key: function (req, file, cb) {
			// to examine file type
			const fileType = getFileType(file.originalname);
			console.log(fileType);
			cb(null, `${Date.now().toString()}.${fileType}`);
		},
	}),
});

awsMethods.s3delete = function (params) {
	// console.log(params);

	const gg = {
		Bucket: BUCKET_NAME,
		Key: params,
	};

	return new Promise((resolve, reject) => {
		s3.deleteObject(gg, function (err, data) {
			if (err) {
				console.log(err);
				reject(err);
			} else {
				console.log("Successfully deleted file from bucket");
				// console.log(data);
				console.log(data);
				resolve(data);
			}
		});
	});
};

// extra functions
function getFileType(fileName) {
	return fileName.split(".").pop();
}

module.exports = awsMethods;
