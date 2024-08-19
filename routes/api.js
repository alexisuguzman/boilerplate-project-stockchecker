"use strict";

const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

// ----------------------------------------------------------------
// Mongoose Stock Schema and Model Definition
// ----------------------------------------------------------------

const stockSchema = new mongoose.Schema({
	stock: { type: String, required: true },
	price: { type: Number, required: true },
	likes: { type: Number, default: 0 },
	ipsLiked: { type: [String], default: [] },
});
const Stock = new mongoose.model("Stock", stockSchema);

// ----------------------------------------------------------------
// Ip related functions
// ----------------------------------------------------------------

const hashIp = async (ip) => {
	const saltRounds = 11;
	try {
		const hashedIp = await bcrypt.hash(ip, saltRounds);
		return hashedIp;
	} catch (err) {
		console.error("Error hashing IP:", err);
		return null;
	}
};

const getHashedIps = async (query = {}) => {
	try {
		const savedIps = await Stock.find(query).select("ipsLiked -_id");
		console.log("Saved ips: ", savedIps);
		const hashedIpsArray = savedIps.map((doc) => doc.ipsLiked).flat();
		console.log("Hashed ips array: ", hashedIpsArray);
		return hashedIpsArray;
	} catch (err) {
		console.error("Error fetching hashed IPs:", err);
	}
};

const isIpSaved = async (ip, hashedIpsArray) => {
	if (hashedIpsArray == [undefined]) {
		console.log("Ip is not saved");
		return false;
	}
	console.log("Checking all ips...");
	for (let hashedIp of hashedIpsArray) {
		if (await bcrypt.compare(ip, hashedIp)) {
			return true;
		}
	}
	return false;
};

// ----------------------------------------------------------------
// Stock related functions
// ----------------------------------------------------------------

const saveOrUpdateStock = async (symbol) => {
	try {
		const price = await getPrice(symbol);
		const stock = await Stock.findOneAndUpdate(
			{ stock: symbol },
			{ price: price },
			{ upsert: true, new: true }
		);
		console.log("Saved/Updated stock to database:", stock);
		return stock;
	} catch (err) {
		console.error("Error saving stock: ", err);
	}
};

const getPrice = async (symbol) => {
	// API url
	const url = `https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${symbol}/quote`;

	// fetch stock price
	try {
		const response = await fetch(url);
		const json = await response.json();
		const stockPrice = json.latestPrice;
		console.log("Type of price:", typeof stockPrice);
		return stockPrice;
	} catch (err) {
		console.log("Error fetching stock: ", err);
	}
};

const singleStockAndLikes = async (symbol, ip, like) => {
	//Create/Update stock document
	let stock = await saveOrUpdateStock(symbol);

	//Check if like stock
	if (like == "true") {
		stock = await likeStock(stock, ip);
	}

	const stockObject = {
		stockData: {
			stock: stock.stock,
			price: stock.price,
			likes: stock.likes,
		},
	};
	console.log(stockObject);
	return stockObject;
};

const compareAndRelativeLikes = async (symbols, ip, likes) => {
	try {
		//Process stock 1
		const stock1 = await singleStockAndLikes(symbols[0], ip, likes);
		//Process stock 2
		const stock2 = await singleStockAndLikes(symbols[1], ip, likes);
		//Build stock object response

		const stocksObject = {
			stockData: [
				{
					stock: stock1.stockData.stock,
					price: stock1.stockData.price,
					rel_likes: stock2.stockData.likes - stock1.stockData.likes,
				},
				{
					stock: stock2.stockData.stock,
					price: stock2.stockData.price,
					rel_likes: stock1.stockData.likes - stock2.stockData.likes,
				},
			],
		};
		console.log(stocksObject);
		return stocksObject;
	} catch (err) {
		console.error("Error fetching stocks to compare: ", err);
	}
};

const likeStock = async (stock, ip) => {
	try {
		const query = { stock: stock.stock };
		const stockLikedIps = await getHashedIps(query);
		const ipLiked = await isIpSaved(ip, stockLikedIps);
		if (ipLiked) {
			console.log("Ip has already liked this stock");
			return stock;
		}
		let hashedIp = await hashIp(ip);

		const likedStock = await Stock.findOneAndUpdate(
			{ stock: stock.stock },
			{ $inc: { likes: 1 }, $push: { ipsLiked: hashedIp } },
			{ new: true }
		);
		console.log("Liked stock: ", likedStock);
		return likedStock;
	} catch (err) {
		console.error("Error liking stock: ", err);
	}
};

// ----------------------------------------------------------------
// GET Route
// ----------------------------------------------------------------

module.exports = function (app) {
	app.route("/api/stock-prices").get(async function (req, res) {
		// Variables for ip encryption
		let ip = req.ip;

		//Check for single price and likes or compare and relative likes
		if (req.query.stock.length == 2) {
			console.log("Comparing stocks: ", req.query.stock);
			const symbols = req.query.stock.map((symbol) => symbol);
			const likes = req.query.like;
			console.log("Likes: ", req.query.like);
			const stocksObject = await compareAndRelativeLikes(symbols, ip, likes);
			res.json(stocksObject);
		} else {
			const symbol = req.query.stock;
			const like = req.query.like;
			const stockObject = await singleStockAndLikes(symbol, ip, like);
			res.json(stockObject);
		}
	});
};
