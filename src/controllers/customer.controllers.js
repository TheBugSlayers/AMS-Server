const express = require("express");
// const router = new express.Router();
const mongoose = require("mongoose");
const TicketTransaction = require("../models/ticketTransaction.model");
// const { authToken, isUser } = require("../middlewares/authRole");
const AuditoriumBooking = require("../models/auditoriumBooking.model");
// const time = require("../models/alllSlots.json");
const { ObjectId } = require("mongodb");
// const { convertDate, isValidEventUpdateDate } = require("../utils/utils");
const email = require("../email/account")

const { convertDate } = require("../utils/utils")

// display all event details to customer
const allEvents = async (req, res) => {
  try {
    let match = {};
    if (req.query._id) match = { _id: ObjectId(req.query._id) };
    else match = req.query ? req.query : {};
    console.log("query", match);
    const allEvents = await AuditoriumBooking.aggregate([
      { $match: match },
      {
        $project: {
          timeSlots: 0,
          auditorium_id: 0,
          organizer_id: 0,
          total_cost: 0,
          total_tickets: 0,
          createdAt: 0,
          updatedAt: 0,
        },
      },
      {$sort:{createdAt:1}}
    ]);
    res.send(allEvents);
  } catch (err) {
    res.send({ error: err.message });
  }
}

// for booking auditorium's ticket
const ticketBooking = async (req, res) => {

  try {
    const event = await AuditoriumBooking.findById(req.body.event_id);
    if (!event)
      throw new Error("can't find event")
    const total_seats = req.body.seat_numbers.length;
    const ticketTransaction = new TicketTransaction({
      seat_numbers: req.body.seat_numbers,
      total_price: event.ticket_price * total_seats,
      event_id: req.body.event_id,
      user_id: req.user._id,
    });
    const bookedDetails = await ticketTransaction.save();
    res.status(200).send({ cTrans_id: bookedDetails._id, amount: bookedDetails.total_price, message: "Please make payment first to confirm your booking." });
  } catch (err) {
    res.status(404).send({ error: err.message });
  }
}

// for making payment of ticket
const ticketBookingPayment = async (req, res) => {

  try {
    const cTrans_id = req.body.cTrans_id
    const amount = req.body.amount
    const sender = req.user._id
    const { status, seat_numbers } = await TicketTransaction.findById(req.body.cTrans_id)
    console.log("status", status)
    if (status == "Confirmed")
      throw new Error("Payment already completed")
    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const { total_price, event_id } = await TicketTransaction.findById(cTrans_id)

      if (req.params.status == "Confirmed") {
        console.log("2")
        if (amount < total_price || amount > total_price)
          throw new Error(`User ${sender.name} you have enter wrong amount`)
        else if (amount == total_price) {
          for (const s of seat_numbers) {
            const ticket_price = total_price / seat_numbers.length
            console.log("tp", ticket_price);
            TicketTransaction.findOneAndUpdate(
              { _id: cTrans_id },
              { $push: { tickets: { "t_price": ticket_price, "seat_no": s } } },

              function (error, success) {
                if (error) {
                  console.log(error);
                } else {
                  console.log(success);
                }
              });
          }
          await TicketTransaction.findByIdAndUpdate(cTrans_id, { status: "true" })
          const event = await AuditoriumBooking.findByIdAndUpdate(event_id, { $inc: { available_tickets: (seat_numbers.length * (-1)) } })
          await session.commitTransaction()
          //email.sendTicketConfirmationMail(req.user.name, event.event_name, amount, event.event_date,event.seat_numbers)
          return res.json({ amount, status: req.params.status })
        }
      }
      else {
        console.log("falied payment")
        await TicketTransaction.findOneAndUpdate({ _id: req.body.cTrans_id },
          { seat_numbers: 0, status: "Failed" })
        await session.commitTransaction()
          email.sendTicketFaliedMail(req.user.name, event.event_name,amount,event.event_date,event.seat_numbers)
        return res.json({ amount, status: "Failed", message: "Booking has been cancel" })
      }
    } catch (err) {
      // const bookingConfirmation = new AudiBookingPayment({ user_id: sender, event_id, amount, status: "Pending" })
      // await bookingConfirmation.save()
      console.log("in abort :", err.message)
      await session.abortTransaction()
      return res.json({ amount, status: "Pending", error: err.message })

    } finally {
      session.endSession()
    }

  } catch (err) {
    console.log("err", err.message)
    return res.send({ error: err.message })
  }
}

// for cancle booking of ticket
const cancleTicket = async (req, res) => {
  try {
    if (!isValidEventUpdateDate) {
      res.status(400).send({ message: "Can't cancle ticket now" })
    }
    const session = await mongoose.startSession()
    session.startTransaction()
    try {
      const ticket = await TicketTransaction.findByIdAndUpdate({ _id: req.params.ticketId }, { $set: { status: "cancel" } })
      const event = await AuditoriumBooking.findByIdAndUpdate({ _id: ticket.event_id }, { $inc: { "available_tickets": ticket.tickets.length } })
      console.log("tikcet", ticket)
      await session.commitTransaction()
      email.sendCancleTicketMail(req.user.name,event.event_name,event.event_date,ticket.total_price)
      res.status(200).send({ message: "Ticket deleted" })
    } catch (err) {
      await session.abortTransaction()
      res.status(500).send({ error: err.message })
    }
    res.status(200).send(ticket)
  } catch (err) {
    res.status().send({ error: err.message })
  }
}

// display all event of particular customer ( display all my event)
const myEvents = async (req, res) => {
  try {
    console.log("in my events");
    let date = Date.now(), match = {}
    date = convertDate(date)
    if (req.query.events == "0")
      match = { $lt: date }
    else match = { $gte: date }
    console.log("match", match)
    const pastEvents = await TicketTransaction.aggregate([
      { $match: { user_id: req.user._id, status: "Confirmed" } },
      {
        $lookup: {
          "from": 'auditoriumbookings',
          'localField': 'event_id',
          "foreignField": '_id',
          "as": 'event'
        }
      },
      { $project: { updatedAt: 0, createdAt: 0, "event.timeSlots": 0, "event.total_cost": 0, "event.organizer_id": 0, "event.auditorium_id": 0, "event.available_tickets": 0, "event.total_tickets": 0 } },
      { $match: { "event.event_date": match } }
    ])
    res.status(200).send(pastEvents)
  } catch (err) {
    res.status(400).send({ error: err.message })
  }
}

// display all transaction of particular customer ( display all mytransactions)
const myTransaction = async (req, res) => {
  try {
    const status = req.query.status
    let match = { user_id: req.user._id }
    if (status)
      match = Object.assign(match, { status })
    console.log("query", match, status)
    const pastEvents = await TicketTransaction.aggregate([
      { $match: match },
      {
        $lookup: {
          "from": 'auditoriumbookings',
          'localField': 'event_id',
          "foreignField": '_id',
          "as": 'event'
        }
      },
      //{ $project: { updatedAt: 0, createdAt: 0, "event.timeSlots": 0, "event.total_cost": 0, "event.organizer_id": 0, "event.auditorium_id": 0, "event.available_tickets": 0, "event.total_tickets": 0 } },
      { $project: { _id: 1, total_price: 1, user_id: 1, status: 1, "event.event_name": 1, createdAt: 1, "event._id": 1 } },
      { $sort: { createdAt: 1 } }
    ])
    res.status(200).send(pastEvents)
  } catch (err) {
    res.status(400).send({ error: err.message })
  }
}
module.exports = { allEvents, ticketBooking, ticketBookingPayment, cancleTicket, myEvents, myTransaction }