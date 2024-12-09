import { config } from "dotenv";
import { connect } from "mongoose";

// Load environment variables
config(); 

const URI = process.env.MONGO_URL;

async function connectDB() {
  try {
    if (!URI) {
      throw new Error("MongoDB connection string is not defined.");
    }
    const connection = await connect(URI);
    console.log(`MongoDB Connected: ${connection.connection.host}`);
    return connection;
  } catch (err) {
    console.error("DB connection failed");
    console.error(err.message || err);
    process.exit(1); 
  }
}

export default connectDB;
