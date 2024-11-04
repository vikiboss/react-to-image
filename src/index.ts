import { app } from './app/index.js'

const PORT = process.env.RTI_PORT || 8080

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`)
})
