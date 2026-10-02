const express = require("express");

const app = express();
const PORT = 3001;

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ message: "Backend is running!" });
});

app.post("/api/recommendations", (req, res) => {
  const { genre, vibe } = req.body;

  res.json({
    genre,
    vibe,
    recommendations: [
      "Song Recommendation 1",
      "Song Recommendation 2",
      "Song Recommendation 3",
    ],
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});