const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')

const apiRouter = require('./routes/api');

const app = express()

app.use(cors({origin: '*'}))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: false}))

const server = app.listen(process.env.PORT || 3000, ()=>{
    console.log(`server is running on port : ${process.env.PORT || 3000}`);
})

app.get('/', (req,res)=>{
    res.send('CakeryAI API 🎂🍰')
})

app.use('/api', apiRouter)