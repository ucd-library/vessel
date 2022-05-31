module.exports = {
  // https://wiki.lyrasis.org/display/VIVODOC110x/Person+Model
  person : {
    types : [
//      'http://xmlns.com/foaf/0.1/Person',
//      'http://vivoweb.org/ontology/core#NonAcademic',
//      'http://vivoweb.org/ontology/core#FacultyMember',
      'http://experts.ucdavis.edu/schema#person'
    ],
    additionalProperties : {
      citation: 'person-citations',
      role: 'person-grants'
    }
  },

  concept : [
    'http://www.w3.org/2004/02/skos/core#Concept',
    'http://experts.ucdavis.edu/schema#concept'
            ],

  // https://wiki.lyrasis.org/display/VIVODOC110x/Publication+Model
  work : [
    'http://experts.ucdavis.edu/schema#work'
//    'http://purl.org/ontology/bibo/AcademicArticle',
//    'http://purl.org/ontology/bibo/Book',
//    'http://purl.org/ontology/bibo/Chapter',
//    'http://vivoweb.org/ontology/core#ConferencePaper',
//    'http://experts.ucdavis.edu/schema#PrePrint'
  ],

  organization : [
    'http://vivoweb.org/ontology/core#AcademicDepartment',
    'http://vivoweb.org/ontology/core#College',
    'http://vivoweb.org/ontology/core#University'
  ],

  grant : [
    'http://vivoweb.org/ontology/core#Grant'
  ]
}
