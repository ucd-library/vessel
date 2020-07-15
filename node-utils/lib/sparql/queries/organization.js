// https://wiki.lyrasis.org/display/VIVODOC110x/Person+Model

module.exports = (uri, graph='?g') => `
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX bibo: <http://purl.org/ontology/bibo/>
PREFIX vivo: <http://vivoweb.org/ontology/core#>
PREFIX vitro: <http://vitro.mannlib.cornell.edu/ns/vitro/0.7#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX vcard: <http://www.w3.org/2006/vcard/ns#>
PREFIX cito: <http://purl.org/spar/cito/>
PREFIX obo: <http://purl.obolibrary.org/obo/>
PREFIX ucd: <http://ucdavis.edu/ns/>
PREFIX ucdrp: <http://experts.library.ucdavis.edu/individual/>

CONSTRUCT {
  ?subject rdf:type ?type .

  ?subject rdfs:label ?label .
  ?subject vivo:abbreviation ?abbreviation .
  ?subject vivo:overview ?overview .
  ?subject vivo:dateTime ?dateTime .

  ?subject vivo:partOf ?partOfOrg .
  ?subject vivo:hasPart ?hasPartOrg .

  ?subject vivo:hasSuccessorOrganization ?hasSuccessorOrganization .
  ?hasPredecessorOrganization vivo:hasPredecessorOrganization ?subject .

  ?subject vivo:affiliatedOrganization ?affiliatedOrganization .

  ?subject obo:contactInfoFor ?contactInfoFor .

  ?contactInfoFor vcard:hasEmail ?vcardEmail .
  ?vcardEmail vcard:email ?email .
  ?vcardEmail rdf:type ?emailType .

  ?contactInfoFor vcard:geo ?geo .

  ?contactInfoFor vcard:hasURL ?vcardURL .
  ?vcardURL vcard:url ?url .
  ?vcardURL vcard:rank ?urlRank .
  ?vcardURL vcard:label ?urlLabel .

  ?contactInfoFor vcard:hasAddress ?vcardAddress .
  ?vcardAddress vcard:locality ?locality .
  ?vcardAddress vcard:postalCode ?postalCode .
  ?vcardAddress vcard:streetAddress ?streetAddress .
  ?vcardAddress vcard:region ?region .
  ?vcardAddress vcard:country ?country .

} WHERE {
  GRAPH ${graph} {
    ?subject rdf:type ?type .

    OPTIONAL { ?subject rdfs:label ?label . }
    OPTIONAL { ?subject vivo:abbreviation ?abbreviation . }
    OPTIONAL { ?subject vivo:overview ?overview . }

    OPTIONAL {
      ?subject vivo:dateTimeValue ?dateTimeValue .
      ?dateTimeValue vivo:dateTime ?dateTime .
    }

    OPTIONAL { ?subject obo:BFO_0000050 ?partOfOrg . }
    OPTIONAL { ?hasPartOrg obo:BFO_0000051 ?subject . }

    OPTIONAL { ?subject vivo:hasSuccessorOrganization ?hasSuccessorOrganization . }
    OPTIONAL { ?hasPredecessorOrganization vivo:hasPredecessorOrganization ?subject . }

    OPTIONAL { ?subject vivo:affiliatedOrganization ?affiliatedOrganization . }

    OPTIONAL {
      ?subject obo:ARG_2000028 ?contactInfoFor .

      OPTIONAL { ?contactInfoFor vcard:hasEmail ?vcardEmail . }
      OPTIONAL { ?vcardEmail vcard:email ?email . }
      OPTIONAL { ?vcardEmail rdf:type ?emailType . }

      OPTIONAL { ?contactInfoFor vcard:hasGeo ?vcardGeo . }
      OPTIONAL { ?vcardGeo vcard:geo ?geo . }

      OPTIONAL { ?contactInfoFor vcard:hasURL ?vcardURL . }
      OPTIONAL { ?vcardURL vcard:url ?url . }
      OPTIONAL { ?vcardURL vcard:rank ?urlRank . }
      OPTIONAL { ?vcardURL vcard:label ?urlLabel . }

      OPTIONAL { ?contactInfoFor vcard:hasAddress ?vcardAddress . }
      OPTIONAL { ?vcardAddress vcard:locality ?locality . }
      OPTIONAL { ?vcardAddress vcard:postalCode ?postalCode . }
      OPTIONAL { ?vcardAddress vcard:streetAddress ?streetAddress . }
      OPTIONAL { ?vcardAddress vcard:region ?region . }
      OPTIONAL { ?vcardAddress vcard:country ?country . }
    }


    FILTER(?subject = <${uri}>)
  }
}`