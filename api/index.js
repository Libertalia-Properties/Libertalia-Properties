const express = require("express");
const axios = require("axios");
const cors = require("cors");
const bodyParser = require("body-parser");
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');
const sharp = require("sharp");

const path = require("path");
const fs = require("fs");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: "900mb" }));
app.use(express.urlencoded({ extended: true, limit: "900mb" }));

app.use(cors()); // Allow requests from any frontend
app.use(bodyParser.json());     // parse application/json
app.use(morgan('dev'));

const PROPERTY24_API_BASE = "https://api.property24.com/listing/v52";
const API_USERNAME = "38530@libertaliaproperties.co.za";
const API_PASSWORD = "Autumn2025";
const AGENCY_ID = "38530";

//Changes

// Function to generate Basic Auth header
const getAuthHeader = () => {
  
  const auth = Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString("base64");
  return `Basic ${auth}`;
};

const proxyOptions = {
  target: PROPERTY24_API_BASE,
  changeOrigin: true,
  pathRewrite: {
      ['']:''
  },
}

const proxy = createProxyMiddleware(proxyOptions);

//app.use('/', proxy);

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");  // Allow all origins (you can restrict this to specific domains for security)
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});


app.get("/", async (req, res) => {
  res.send("WELCOME TO PROPERTY24 PROXY SERVER");
});

async function imageToBase64(imageUrl) {
  try {
    
    const response = await axios.get(imageUrl, { 
      responseType: "arraybuffer"
    });
    
    let imageBuffer = Buffer.from(response.data, "binary");
    // Auto-rotate and ensure landscape orientation
        const processedImageBuffer = await sharp(imageBuffer)
            .toBuffer();

    // Detect MIME type from headers
    let mimeType = response.headers["content-type"];
    console.log("MIME TYPE ::: " + JSON.stringify(mimeType));

    // If MIME type is missing or incorrect, infer based on file extension
        if (!mimeType || mimeType === "application/octet-stream") {
            if (imageUrl.endsWith(".jpg") || imageUrl.endsWith(".jpeg")) {
                mimeType = "image/jpeg";
            } else if (imageUrl.endsWith(".png")) {
                mimeType = "image/png";
            } else if (imageUrl.endsWith(".gif")) {
                mimeType = "image/gif";
            } else {
                mimeType = "image/jpeg"; // Default fallback
            }
        }

    const base64Image = processedImageBuffer.toString("base64");

    return {bytes:base64Image};

  } catch (error) {
    console.error("Error converting image:", error.message); // Only log the error message
    return error.message;
  }
}

async function pictureToBase64(imageUrl) {
  try {
    
    const response = await axios.get(imageUrl, { 
      responseType: "arraybuffer"
    });
    
    //const base64Image = Buffer.from(response.data, "binary").toString("base64");
    
    const contentType = response.headers["content-type"];
    const base64Image = Buffer.from(response.data, "binary").toString("base64");

    return `${base64Image}`;
  } catch (error) {
    console.error("Error converting image:", error.message); // Only log the error message
    return null;
  }
};

const processImage = async (photo) => {  
      try {
        //console.log("REQ.BODY :::: Final Photo :::::: " + JSON.stringify(photo));

        const base64Image = await imageToBase64(photo);
        console.log("Received image size:", Buffer.byteLength(base64Image.bytes, "base64"), "bytes");

        return base64Image ? { bytes: base64Image.bytes, mimeContentType: base64Image.mimeContentType } : null;
      } catch (error) {
        console.error(`Error processing image: `, error);
        return error.message; // Skip failed images
      }
};

const processImages = async (photos) => {
  const processedPhotos = await Promise.all(
    
    photos.map(async (url) => {
      try {
        console.log("url ::: ", url);
        const base64Image = await imageToBase64(url);
        return base64Image ? { bytes: base64Image.bytes, mimeContentType: base64Image.mimeContentType } : null;
      } catch (error) {
        console.error(`Error processing image: ${url}`, error);
        return null; // Skip failed images
      }
    })
  )
  const validPhotos = processedPhotos.filter(photo => photo && photo.bytes);
  
  // Join the image objects as comma-separated string
  return validPhotos;

};

const processPhotos = async (photos) => {
  
  const base64Images = await Promise.all(
        photos.map(async (url) => {
            return await imageToBase64(url);
        })
    );

    // Filter out any null values (failed images)
    return base64Images.filter(image => image !== null);

};


app.post("/convert", async (req, res) => {
  const { imageUrl, caption } = req.body;
  if (!imageUrl) return res.status(400).json({ error: "Image URL is required" });
  //console.log("REQ.BODY :::: req.body :::::: " + JSON.stringify(req.body));
  //console.log("REQ.BODY :::: caption :::::: " + JSON.stringify(caption));

  //const base64Image = await imageToBase64(imageUrl);
  //if (!base64Image) return res.status(500).json({ error: "Failed to convert image" });
    //console.log("REQ.BODY :::: FINAL base64Image :::::: " + JSON.stringify(base64Image));


    // Process images before making the API call
    const finalPhoto = await processImage(imageUrl);
    //console.log("REQ.BODY :::: FINAL finalPhoto :::::: " + JSON.stringify(finalPhoto));

    // Construct final JSON payload
    const finalPayload = {
        ...finalPhoto,
        caption: caption
    };
    //console.log("REQ.BODY :::: FINAL PAYLOAD :::::: " + JSON.stringify(finalPayload));
    //res.json(finalPayload);

  res.send(finalPayload);
  //res.json({ base64Image });
});

/**
 * 
 * API Route: Convert Profile Picture to Base64
 */
app.post("/convertProfile", async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: "Image URL is required" });

  const base64Image = await imageToBase64(imageUrl);
  if (!base64Image) return res.status(500).json({ error: "Failed to convert image" });

  res.json({ bytes: base64Image });
  //res.json({ base64Image });
});


app.post("/convertMultiple", async (req, res) => {
  const { imageUrls } = req.body; // Expecting an array of image URLs
  //console.log("IMAGE URLS ::: " + JSON.stringify(imageUrls));


  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return res.status(400).json({ error: "At least one image URL is required" });
  }

  try {
    // Convert each image URL to Base64
    const base64Images = await Promise.all(
      imageUrls.map(async (url) => {
        try {
          console.log("url :::: " + JSON.stringify(url));
          //console.log("base64 :::: " + JSON.stringify(base64));

          // Filter out any null values (failed images)
          return await imageToBase64(url);
        
        } catch (error) {
          console.error(`Failed to convert image: ${url}`, error.message);
          return { url, error: "Failed to convert image" };
        }
      })
    );
      
    /**
     * 
     * // Filter out null values and return a plain object without an array
    const result = base64Images.filter(Boolean).reduce((acc, obj) => {
      return { ...acc, ...obj }; // Merging the objects into a single object without array
    }, {});

     * 
     */
    
    // Filter out null values 
    const result = base64Images.filter(Boolean);

    //const filePath = path.join(__dirname, 'imageBytes.json');
    //fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
    //console.log("Payload saved to imagebytes.json :: ", filePath);

    // Send as raw text (pure list of base64)
    //res.send(result.join(","));  // Sends a newline-separated list of base64 strings

    res.json(result);

    //res.json(result);
    // Convert array to string (remove brackets)
    //const formattedResponse = base64Images.filter(Boolean).map((obj) => JSON.stringify(obj)).join(",");
    //const formattedResponse = { photos: base64Images.filter(Boolean) };

    
    // Send response as raw JSON text

    // Return only valid base64 objects
    //res.json(base64Images.filter(Boolean));    //res.json({base64Images});
  } catch (error) {
    console.error("Error processing images:", error.message);
    res.status(500).json({ error: "Failed to convert images" });
  }
});

app.post("/converterMultiple", async (req, res) => {
  const { imageUrls } = req.body; // Expecting an array of image URLs
  console.log("IMAGE URLS ::: " + JSON.stringify(imageUrls));


  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return res.status(400).json({ error: "At least one image URL is required" });
  }

  try {
    // Convert each image URL to Base64
    const base64Images = await Promise.all(
      imageUrls.map(async (url) => {
        try {
          const base64 = await processImage(url);
          //console.log("url :::: " + JSON.stringify(url));
          //console.log("base64 :::: " + JSON.stringify(base64));

          return base64 || null;
        } catch (error) {
          console.error(`Failed to convert image: ${url}`, error.message);
          return { url, error: "Failed to convert image" };
        }
      })
    );
      
 
    
    // Filter out null values 
    const result = base64Images.filter(Boolean);


    const filePath = path.join(__dirname, 'listing.json');
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
    console.log("Payload saved to payload.json :: ", filePath);

    // Send as raw text (pure list of base64)
    res.send(result.join(","));  // Sends a newline-separated list of base64 strings

    //res.json(result);

    //res.json(result);
    // Convert array to string (remove brackets)
    //const formattedResponse = base64Images.filter(Boolean).map((obj) => JSON.stringify(obj)).join(",");
    //const formattedResponse = { photos: base64Images.filter(Boolean) };

    
    // Send response as raw JSON text

    // Return only valid base64 objects
    //res.json(base64Images.filter(Boolean));    //res.json({base64Images});
  } catch (error) {
    console.error("Error processing images:", error.message);
    res.status(500).json({ error: "Failed to convert images" });
  }
});



// API Key (if required)
//const API_KEY = process.env.PROPERTY24_API_KEY; // Store this in a .env file

// Middleware for Authentication (If API Key is required)
/**
const getHeaders = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${API_KEY}`,
  "User-Agent": "Node.js/Express"
});
 */

app.get("/echo", async (req, res, next) => {
  try {
      
      const url = `${PROPERTY24_API_BASE}/echo`;
      console.log("URL :: " + JSON.stringify(url)); 

      console.log("ECHO GET ::: QUERY :: " + JSON.stringify(req.query)); 
      
      const options = {
          headers: {
              'Content-Type': 'application/json',
              'Accept-Encoding': 'gzip, deflate, br',
              'Access-Control-Allow-Origin': '*'
          },
          params: { 
            
            stringToEcho: req.query.stringToEcho,

          },
      }; 
      
      ///console.log("REQ HEADERS :: " + JSON.stringify(req.headers)); 
      
      //console.log("REQ PROTOCOL :: " + (req.protocol)); 
      //console.log("REQ HOSTNAME :: " + (req.hostname)); 
      //console.log("REQ PATH :: " + (req.path)); 
      //console.log("REQ ORIGINAL URL :: " + (req.originalUrl)); 
      //console.log("REQ SUBDOMAINS :: " + (req.subdomains)); 
      
      const response = await axios.get(url, options)
              .then(function (response) {
                  console.log("Property24 RESPONSE ::: " + response.data);
                  //console.log("RESPONSE HEADERS :::: " + response.headers);
                  //console.log("RESPONSE STATUS :::: " + response.status);
                  //console.log("RESPONSE CONFIG :::: " + JSON.stringify(response.config));
                  //console.log("RESPONSE REQUEST :::: " + response.request);
                  //console.log("RESPONSE STATUS TEXT :::: " + response.statusText);
                  
                  res.status(200).json(response.data);
              })
              .catch(function (error) {
                  console.error(error);
              });
        
              //res.json(response);
              next();
  } catch(error) {

      console.log("ERROR :::: " + error)
      //res.status(500).json({ message: error });
  }
});


app.get("/echo-authenticated", async (req, res, next) => {
  try {
      
    const url = `${PROPERTY24_API_BASE}/echo-authenticated`;
      console.log("ECHO GET ::: QUERY :: " + JSON.stringify(req.query)); 
      
      
      const options = {
          params: { stringToEcho: req.query.stringToEcho},
          headers: {
            Authorization: getAuthHeader(), // Fix authentication
            "Content-Type": "application/json",
            "Accept-Encoding": "gzip, deflate, br",
            "Access-Control-Allow-Origin": "*",
          },
      };
      
      //console.log("REQ PARAMS :: " + JSON.stringify(req.params)); 
      
      //console.log("REQ PROTOCOL :: " + (req.protocol)); 
      //console.log("REQ HOSTNAME :: " + (req.hostname)); 
      //console.log("REQ PATH :: " + (req.path)); 
      //console.log("REQ ORIGINAL URL :: " + (req.originalUrl)); 
      //console.log("REQ SUBDOMAINS :: " + (req.subdomains)); 
      
      const response = await axios.get(url, options)
              .then(function (response) {
                  console.log("Property24 RESPONSE ::: " + response.data);
                  //console.log("RESPONSE HEADERS :::: " + response.headers);
                  //console.log("RESPONSE STATUS :::: " + response.status);
                  //console.log("RESPONSE CONFIG :::: " + JSON.stringify(response.config));
                  //console.log("RESPONSE REQUEST :::: " + response.request);
                  //console.log("RESPONSE STATUS TEXT :::: " + response.statusText);
                  
                  res.status(200).json(response.data);
              })
              .catch(function (error) {
                  console.error(error);
              });

      //res.json(response);

      next();
  } catch(error) {

      console.log("ERROR :::: " + error)
      res.status(500).json({ message: error });
  }
});


app.get("/suburbs/find-from-point", async (req, res, next) => {
  try {
      
    const url = `${PROPERTY24_API_BASE}/suburbs/find-from-point`;
      console.log("ECHO GET ::: QUERY :: " + JSON.stringify(req.query)); 
      
      const options = {
          params: { 
            latitude: req.query.latitude,
            longitude: req.query.longitude
          },
          headers: {
            Authorization: getAuthHeader(), // Fix authentication
            "Content-Type": "application/json",
            "Accept-Encoding": "gzip, deflate, br",
            "Access-Control-Allow-Origin": "*",
          },
      };
      
       
      const response = await axios.get(url, options)
              .then(function (response) {
                  console.log("Property24 RESPONSE ::: " + JSON.stringify(response.data));
                   
                  res.status(200).json(response.data);
              })
              .catch(function (error) {
                  console.error(error);
              });
 
      next();
  } catch(error) {

      console.log("ERROR :::: " + error)
      res.status(500).json({ message: error });
  }
});


app.get("/agents/:agentId", async (req, res, next) => {
  try {
      console.log("REQ PARAMS :: " + JSON.stringify(req.params)); 
      console.log("REQ QUERY :: " + JSON.stringify(req.query)); 

      //const url = 'https://api.exdev.property24-test.com/listing/v49/agents/75003';
      //const url = `${PROPERTY24_API_BASE}/agents/${req.query}`;
      const url = `${PROPERTY24_API_BASE}/agents/${req.params.agentId}`;

      const options = {
        params: { agentId: req.params.agentId},
        headers: {
          Authorization: getAuthHeader(), // Fix authentication
          "Content-Type": "application/json",
          "Accept-Encoding": "gzip, deflate, br",
          "Access-Control-Allow-Origin": "*",
        },
    };
    
      //console.log("REQ PROTOCOL :: " + (req.protocol)); 

      //console.log("REQ PROTOCOL :: " + (req.protocol)); 
      //console.log("REQ HOSTNAME :: " + (req.hostname)); 
      //console.log("REQ PATH :: " + (req.path)); 
      //console.log("REQ ORIGINAL URL :: " + (req.originalUrl)); 
      //console.log("REQ SUBDOMAINS :: " + (req.subdomains)); 
      
      const response = await axios.get(url, options)
              .then(function (response) {
                  //console.log("Property24 RESPONSE ::: " + JSON.stringify(response.data));
                  //console.log("RESPONSE HEADERS :::: " + response.headers);
                  //console.log("RESPONSE STATUS :::: " + response.status);
                  //console.log("RESPONSE CONFIG :::: " + JSON.stringify(response.config));
                  //console.log("RESPONSE REQUEST :::: " + (response.request).json);
                  //console.log("RESPONSE STATUS TEXT :::: " + response.statusText);
                  
                  res.status(200).json(response.data);
              })
              .catch(function (error) {
                  console.error(error);
              });
          next();

  } catch(error) {

      console.log("ERROR :::: " + error)
      res.status(500).json({ message: error });
  }
});

app.get("/agencies/:agencyId/agents", async (req, res, next) => {
  try {
      
    const url = `${PROPERTY24_API_BASE}/agencies/${AGENCY_ID}/agents`;
      
    const options = {
      headers: {
        Authorization: getAuthHeader(), // Fix authentication
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip, deflate, br",
        "Access-Control-Allow-Origin": "*",
      },
  };
       
      //console.log("REQ PROTOCOL :: " + (req.protocol)); 
      //console.log("RES HOSTNAME :: " + (req.hostname)); 
      //console.log("REQ PATH :: " + (req.path)); 
      //console.log("REQ ORIGINAL URL :: " + (req.originalUrl)); 
      //console.log("REQ SUBDOMAINS :: " + (req.subdomains)); 
      
      const response = await axios.get(url, options)
              .then(function (response) {
                  //console.log("Property24 RESPONSE ::: " + JSON.stringify(response.data));
                   //console.log("RESPONSE HEADERS :::: " + response.headers);
                  //console.log("RESPONSE STATUS :::: " + response.status);
                  //console.log("RESPONSE CONFIG :::: " + JSON.stringify(response.config));
                  //console.log("RESPONSE REQUEST :::: " + (response.request).json);
                  //console.log("RESPONSE STATUS TEXT :::: " + response.statusText);
                  
                  res.status(200).json(response.data);
              })
              .catch(function (error) {
                  console.error(error);
              });

              //res.json(response.data);

          next();

  } catch(error) {

      console.log("ERROR :::: " + error)
      res.status(500).json({ message: error });
  }
});


//Route to Update Agent Profile Picture
app.put("/agents/:agentId/profile-picture", async (req, res, next) => {
  try {
      
    
    const { agentId } = req.params;
    console.log("AGENT ID :: " + agentId);
    
    const { imageUrl, caption } = req.body;
    console.log("REQ BODY :: " + JSON.stringify(req.body));
    console.log("IMAGE URL :: " + JSON.stringify(imageUrl));
    console.log("CAPTION :: " + JSON.stringify(caption));

    
    
    const url = `${PROPERTY24_API_BASE}/agents/${agentId}/profile-picture`;

    const options = {
      headers: {
        Authorization: getAuthHeader(), // Fix authentication
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
       
      //console.log("REQ PROTOCOL :: " + (req.protocol)); 
      //console.log("RES HOSTNAME :: " + (req.hostname)); 
      //console.log("REQ PATH :: " + (req.path)); 
      //console.log("REQ ORIGINAL URL :: " + (req.originalUrl)); 
      //console.log("REQ SUBDOMAINS :: " + (req.subdomains)); 

      // Process images before making the API call
    const finalPhoto = await processImage(imageUrl);
    //console.log("REQ.BODY :::: FINAL finalPhoto :::::: " + JSON.stringify(finalPhoto));

    // Construct final JSON payload
    const finalPayload = {
        ...finalPhoto,
        caption: caption
    };
      
    //res.json(finalPayload);

    const response = await axios.put(url,finalPayload, options)
            .then(function (response) {
                  console.log("Property24 RESPONSE ::: " + JSON.stringify(response));
                   //console.log("RESPONSE HEADERS :::: " + response.headers);
                  //console.log("RESPONSE STATUS :::: " + response.status);
                  //console.log("RESPONSE CONFIG :::: " + JSON.stringify(response.config));
                  //console.log("RESPONSE REQUEST :::: " + (response.request).json);
                  //console.log("RESPONSE STATUS TEXT :::: " + response.statusText);
                  res.status(response.status).json(response);

              })
              .catch(function (error) {
                  console.error(error);
              });
      //res.status(response.status).json(response.data);

  } catch(error) {
      console.log("ERROR :::: " + error);
      //res.status(500).json({ message: error }); 
  }
});

// Update Agent Info Endpoint
app.put("/agents", async (req, res) => {
  try {
     
    const agentData = req.body; // JSON body from Glide
    //console.log("REQ BODY :: " + JSON.stringify(req.body));

    if (!agentData || Object.keys(agentData).length === 0) {
      return res.status(400).json({ error: "Missing agent data" });
    }

    //console.log("Received agent update data:", agentData);

    const url = `${PROPERTY24_API_BASE}/agents`;

    const options = {
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
    };

    const response = await axios.put(url, agentData, options);
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error updating agent info:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to update agent information" });
  }
});

// Route to Create an Agent
app.post("/agents", async (req, res, next) => {
  try {
      
      const url = `${PROPERTY24_API_BASE}/agents`;

      //console.log("ECHO GET ::: QUERY :: " + JSON.stringify(url)); 
      
      const options = {
        headers: {
          Authorization: getAuthHeader(),
          "Content-Type": "application/json",
        },
      };
      
      //console.log("REQ PARAMS :: " + JSON.stringify(req.params)); 

      const agentData = req.body;      
      //console.log("REQ BODY :::: " + JSON.stringify(req.body));
      
      //console.log("REQ PROTOCOL :: " + (req.protocol)); 
      //console.log("REQ HOSTNAME :: " + (req.hostname)); 
      //console.log("REQ PATH :: " + (req.path)); 
      //console.log("REQ ORIGINAL URL :: " + (req.originalUrl)); 
      //console.log("REQ SUBDOMAINS :: " + (req.subdomains)); 
      
      const response = await axios.post(url, agentData, options)
              .then(function (response) {
                  //console.log("Property24 RESPONSE ::: " + response.data);
                  //console.log("RESPONSE HEADERS :::: " + response.headers);
                  //console.log("RESPONSE STATUS :::: " + response.status);
                  //console.log("RESPONSE CONFIG :::: " + JSON.stringify(response.config));
                  //console.log("RESPONSE REQUEST :::: " + response.request);
                  //console.log("RESPONSE STATUS TEXT :::: " + response.statusText);
                  
                  res.status(response.status).json(response.data);
              })
              .catch(function (error) {
                  console.error(error);
              });
      next();

  } catch(error) {

      console.log("ERROR :::: " + error)
      res.status(500).json({ message: error });
  }
});

// Route to Create a Listing
app.post("/listings", async (req, res) => {
  try {

    const url = `${PROPERTY24_API_BASE}/listings`;

    const options = {
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
    };

    const { photos, ...listingData } = req.body;
    console.log("REQ.BODY :::: PHOTOS ::::::: " + JSON.stringify(photos));
    //console.log("REQ.BODY :::: LISTING DATA :::::: " + JSON.stringify(listingData));

    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return res.status(400).json({ error: "No photos provided" });
    }

    
    // Process images before making the API call
    const finalPhotos = await processImages(photos);

    // Construct final JSON payload
    const finalPayload = {
        ...listingData,
        photos: finalPhotos
    };
    //console.log("REQ.BODY :::: FINAL PAYLOAD :::::: " + JSON.stringify(finalPayload));
    //res.json(finalPayload);


    //const filePath = path.join(__dirname, 'listing.json');
    //fs.writeFileSync(filePath, JSON.stringify(finalPayload, null, 2));
    //console.log("Payload saved to listing.json :: ", filePath);
    //res.send((finalPayload));

    const response = await axios.post(url, finalPayload, options);
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error creating listing:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to create listing" });
  }
});


app.put("/listings", async (req, res) => {
  try {
     
    const listingData = req.body; // JSON body from Glide
    //console.log("REQ BODY :: " + JSON.stringify(req.body));

    if (!listingData || Object.keys(listingData).length === 0) {
      return res.status(400).json({ error: "Missing listing data" });
    }

    //console.log("Received agent update data:", agentData);

    const url = `${PROPERTY24_API_BASE}/listings`;

    const options = {
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
    };

    const response = await axios.put(url, listingData, options);
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error updating listing info:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to update listing information" });
  }
});

//Route to Update Listing Status
app.put("/listings/:listingNumber/status", async (req, res, next) => {
  try {
      
    
    const { listingNumber } = req.params;
    console.log("req.params ::: " + JSON.stringify(req.params));
    console.log("Listing Number :: " + JSON.stringify(listingNumber));

    const { listingStatus } = req.query;
    console.log("req.query :: " + JSON.stringify(req.query));

    const url = `${PROPERTY24_API_BASE}/listings/${listingNumber}/status`;

    const options = {
      params: {
        listingNumber: req.params.listingNumber, 
        listingStatus: req.query.listingStatus 
      },
      headers: {
        Authorization: getAuthHeader(), // Fix authentication
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
       
      //console.log("REQ PROTOCOL :: " + (req.protocol)); 
      //console.log("RES HOSTNAME :: " + (req.hostname)); 
      //console.log("REQ PATH :: " + (req.path)); 
      //console.log("REQ ORIGINAL URL :: " + (req.originalUrl)); 
      //console.log("REQ SUBDOMAINS :: " + (req.subdomains)); 
      
      const response = await axios.put(url,listingStatus, options);
      res.status(response.status).json(response.data);

              //res.json(response.data);

          next();

  } catch(error) {

      console.log("ERROR :::: " + error)
      res.status(500).json({ message: error });
  }
});


// Route to Fetch Listings
app.get("/listings", async (req, res) => {
  try {
    const response = await axios.get(`${PROPERTY24_API_BASE}/listings`, {
      headers: getHeaders(),
    });
    res.json(response.data);
  } catch (error) {
    console.error("Error fetching listings:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to fetch listings" });
  }
});
// Route to Fetch Listings
app.get("/listings/reconciliation", async (req, res, next) => {
  
  const url = `${PROPERTY24_API_BASE}/listings/reconciliation`;
  console.log("URL ::: " + JSON.stringify(url));

  console.log("req.query ::: " + JSON.stringify(req.query));


  const options = {
    params: req.query.agentId 
    ? { agentId: req.query.agentId } 
    : { agencyId: req.query.agencyId },
    headers: {
      Authorization: getAuthHeader(), // Fix authentication
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  };

  const response = await axios.get(url, options);
      res.status(response.status).json(response.data);

              //res.json(response.data);

          next();


});


app.get("/listings/leads", async (req, res, next) => {
  
  const url = `${PROPERTY24_API_BASE}/listings/leads`;
  console.log("URL ::: " + JSON.stringify(url));

  console.log("req.query ::: " + JSON.stringify(req.query));


  const options = {
    params: {
      after: req.query.after, 
    },
    headers: {
      Authorization: getAuthHeader(), // Fix authentication
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  };

  const response = await axios.get(url, options);
      res.status(response.status).json(response.data);

              //res.json(response.data);

          next();


});

// Start the server locally
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running locally at http://localhost:${PORT}`);
  });
}


/**
 * Start Server
 * 
 */
// Export the Express app for Vercel
module.exports = app;
