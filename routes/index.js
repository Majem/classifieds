var express = require('express');
var router = express.Router();
var redis = require('redis');
var client = redis.createClient();
var crypto = require('crypto');
const url = require("url");
var uniqid = require('uniqid');


/* GET home page. */
router.get('/', function (req, res, next) {
    const user = req.cookies.user;
    const getAdverts = new Promise(async resolve => {
        await client.keys("adverts:*", function (err, advKeys) {
            var adverts = [];
            var counter = advKeys.length;

            if(counter === 0) resolve([]);

            advKeys.forEach(async function (advKey) {

                await client.hgetall(advKey, function (err, dbAdv) {
                    console.log(err);

                    adverts.push(dbAdv);
                    counter--;
                    if (counter == 0)
                        resolve(adverts);
                });
            });
        });
    });

    getAdverts.then(adverts => { res.render('index', {user:   user, adverts: adverts, status : req.query});  });

});

router.get('/adv-delete?:id', function (req, res, next) {

    var aId = req.query.id;
    var user = req.cookies.user;

    const deleteAdvert = new Promise(async resolve => {
        await client.hgetall("adverts:" + aId, function (err, dbAdvert) {

            if (dbAdvert.uId !== user.uId) {
                resolve({
                    status: false,
                    msg: 'Tylko autor może usuwać ogłoszenia'
                })
            }
            client.del("users:" + dbAdvert.uId + ":adverts:" + aId);
            client.del("adverts:" + aId);
            resolve({
                status: true,
                msg: 'Pomyślnie usunięto ogłoszenie '
            })
        });

    });

    deleteAdvert.then(response => {


        res.redirect(url.format({
            pathname: "/",
            query: response
        }));
    });
});

router.get('/profile', function (req, res, next) {
    const user = req.cookies.user;

    console.log(user);

    res.render('profile', {user: user});
});

router.get('/login', function (req, res, next) {
    res.render('login');
});

router.get('/logout', function (req, res, next) {
    res.cookie('user', null);
    res.cookie('sessionUid', null);
    res.redirect('/');
});

router.get('/register', function (req, res, next) {
    console.log(req);

    res.render('register');
});

router.get('/add-advert', function (req, res, next) {
    const user = req.cookies.user;

    console.log(user);

    res.render('add-advert', {user: user});
});

router.post('/add-advert', function (req, res, next) {
    var formData = req.body;
    const user = req.cookies.user;

    formData.aId = uniqid();

    console.log(formData);

    client.sadd("users:" + formData.uId + ":adverts:" + formData.aId, formData.aId);
    client.hmset("adverts:" + formData.aId, formData);

    res.render('add-advert', {
        user: user,
        data: formData,
        status: {status: true, msg: "Pomyślnie dodano ogłoszenie !"}
    });
});

router.post('/change-password', function (req, res, next) {
    var formData = req.body;

    const changePassword = new Promise(async resolve => {
        await client.hgetall("users:" + formData.uId, function (err, dbUser) {

            var password = crypto.createHash('md5').update(formData.password).digest("hex");
            var newPassword = crypto.createHash('md5').update(formData.newPassword).digest("hex");
            if (password === dbUser.password) {

                console.log('Zgadza sie');
                dbUser.password = newPassword;
                client.hmset("users:" + formData.uId, dbUser);
                resolve({
                    status: true,
                    msg: "Hasło pomyślnie zmienone"
                });

            } else {
                resolve({
                    status: false,
                    msg: "Błędne aktualne hasło"
                });
            }

        });
    });

    changePassword.then(status => {
        console.log(status);

        const user = req.cookies.user;

        res.render('profile', {user: user, status: status});
    });

});

router.post('/login', function (req, res, next) {
    var formData = req.body;

    var uId = crypto.createHash('md5').update(req.body.username + req.body.password).digest("hex");

    var username = formData.username.toLowerCase();
    var password = crypto.createHash('md5').update(formData.password).digest("hex");

    if (username.length > 0 && password.length > 0) {
        const getUser = new Promise(async resolve => {
            await client.keys("users:*", function (err, userKeys) {
                userKeys.forEach(function (userKey) {


                    client.hgetall(userKey, function (err, dbUser) {
                        if (username === dbUser.username && password === dbUser.password) {
                            resolve(userKey);
                            res.cookie('user', dbUser);
                        }
                    });
                });
            });

        });

        getUser.then(user => {
            console.log(user);
            res.cookie('sessionUid', user);
            res.redirect('/');
        });
    }

});

router.post('/register', function (req, res, next) {
    var uId = crypto.createHash('md5').update(req.body.username + req.body.password).digest("hex");

    var formData = req.body;

    var user = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        password: crypto.createHash('md5').update(formData.password).digest("hex"),
        username: formData.username.toLowerCase(),
        email: formData.email,
        uId: uId,

        profile: JSON.stringify({
            address: formData.address,
            city: formData.city,
            country: formData.country,
            state: formData.address,
            postalCode: formData.address,
            platforms: formData.platforms,
        })
    };


    const validateUser = new Promise(async resolve => {
        client.keys("users:*", function (err, userKeys) {
            userKeys.forEach(function (userKey) {

                client.hgetall(userKey, function (err, dbUser) {

                    var validateErrors = [];

                    if (dbUser.username === user.username) validateErrors.push("Login zajęty");

                    if (dbUser.email === user.email) validateErrors.push("Email zajęty");


                    if (validateErrors.length > 0) resolve(validateErrors);
                });
            });

            resolve([]);
        });
    });

    validateUser.then(errors => {

        if (errors.length > 0) res.render('register', {errors: errors});

        client.sadd("users", uId);
        client.hmset("users:" + uId, user);

        res.redirect('/login');


    });


});


module.exports = router;
