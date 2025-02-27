// main.js

//  apiName = apisftest  
//  serverName = lstest.convey.de
//  userName = conveyapisf1
//  password = leadsuccess



// filter LS_User

//https://lstest.convey.de/apisftest/LS_Event?$format=json

 // Filter parameters
    // id = apitestappuser
    // FirstName = appuser
    // LastName = apitest
    // EventId = 9b1763d8-1c4e-47ce-8903-41b74b0720e9

// Url request 

//https://lstest.convey.de/apisftest/LS_User?$format=json&$filter=Id eq 'apitestappuser' and FirstName eq 'appuser' and LastName eq 'apitest' and EventId eq '9b1763d8-1c4e-47ce-8903-41b74b0720e9'


// filter LS_Event
//https://lstest.convey.de/apisftest/LS_Event?$format=json&$filter=Id eq '9b1763d8-1c4e-47ce-8903-41b74b0720e9' and FirstName eq 'appuser' and LastName eq 'apitest' and EventId eq '9b1763d8-1c4e-47ce-8903-41b74b0720e9'


//https://lstest.convey.de/apisftest/LS_Event?$format=json?$filter=year(StartDate)=2024

// Id : 9b1763d8-1c4e-47ce-8903-41b74b0720e9
// Subject : API Test
// StartDate : 01/01/2019  -- format mm/dd/yyyy
// StartDate : 12/31/2031  -- format mm/dd/yyyy