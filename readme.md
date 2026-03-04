# GensDB
This project was created to help me with world building, keeping track of Characters and their relation. I had always used spread sheets before so I built this family tree application to be able to see full relations. I recently added code to see the relation between two characters, the original code is under the relationChecker folder, it has been integrated into the rest of the project. It tells you exactly how two people are related in every single possible way, with each of their common ancestors. I was testing this service with the Targaryen Family Tree from a Song of Ice and Fire, and as one could imagine, those characters are related in a million ways.
## How to Use
1. Add a House
- You can name it what ever you want if using a roman name, use the feminine version, as it will automatically change when rendered out for the character, z. B., Gens Julia -> Gaius Julius Caesar
- You can also just name it what ever and it will work, most of my testing was with ASOIAF houses as we have better records for those than many classical Roman Gens.

2. Create the Founder
Two ways to do this:
- Navigate to _View Houses_
- You should see: __YourHouse__ - _No founder set_ - Edit House
- Click Edit House
- You will see a form, Set Founder and Create New Founder
- If You haven't created a Character yet, fill out the form for Create New Founder, and a new Character will be created and auto assigned to the House
The second way is obvious at this point:
- Go back to home, Naviagte to _Add a Person_
- Here you can fill out the information
    - Praenomen (Firstname)
    - House
        - Dropdown which will have the house you created
    - Sex
    - Cognomen (Nickname, think Caesar)
    - Birth Year, if BC, enter Negative Value, if AD enter Positive
    - Same with Death, both Fields are optional
    - Bastard
        - This was mainly for my ASOIAF activites, if you check Bastard, the characters house name will not render with the Character in text, this allows you to put something else in the Cognomen or simply in the Praenomen. Zum Beispiel: Jon Snow would be entered Jon Stark Snow, checking the bastard bool will give you the wanted Jon Snow.
    - Parents
        - If this is the first character you're making obviously it will have to be set none, but you can always go back and edit characters later to fill out this information (This is the whole point of the application)
- Finally click Create Person
- Go back to Edit house, and select your new character from the Select Founder drop down. Then click save.

3. View the character.
- At home, you will see Existing Houses, click the View Tree link to your new house, and you should see your new character there with a link to their character.
- Click on their link, you will see all information relavent, Name, Gens, Sex, Parents, Children, and Siblings, then nav links of Edit, View all Relationships, Family Tree, and Back to People( Goes to a table with every character sorted by House )

4. Fill out more characters
5. View relations
- Either from the view relations on the characters page or Check Relationship between people link at home
- On Check, you will have two drop downs, select your two, check relationship and see how they are related. If you have multiple trees with lots of peopel you can click compute all, it will fill out every relation, might take a while. Then you can go to Relationship Statistics and see a table with how many relations each people have in the system. Click view all and see how they are related to each of those characters.



__Thats it for now__