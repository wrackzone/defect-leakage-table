Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    launch: function() {
        this._getIterations();
    },
    
    _getIterations : function() {
        var that = this;
        
        var releaseStore = Ext.create('Rally.data.WsapiDataStore', {
            autoLoad: true,
            model: 'Iteration',
            limit : 'Infinity',
            fetch: ['Name', 'ObjectID', 'Project', 'StartDate', 'EndDate' ],
            filters: [],
            listeners: {
                load: function(store, records) {
                    // get a unique set of iterations by name
                    that.iterations = _.uniq( records, function (rec) { return that._getIterationName(rec); });
                    // sort by end date
                    that.iterations = _.sortBy( that.iterations, function (i) {
                       return new Date( Date.parse( i.get("EndDate"))) ;
                    });
                    // get the defect data
                    that._getDefects();
                }
            }
        });
    },
    
    _getDefects : function() {
        
        var that = this;

        Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad : true,
            limit: Infinity,
            listeners: {
                load: that._onDefectData,
                scope : this
            },
            fetch: ['ObjectID','CreationDate', 'Environment', '_TypeHierarchy' ],
            hydrate: ['_TypeHierarchy','Environment'],
            filters: [
                {
                    property: '_ProjectHierarchy',
                    operator : 'in',
                    value : [that.getContext().getProject().ObjectID] // 5970178727
                },
                {
                    property: '_TypeHierarchy',
                    operator: 'in',
                    value: ['Defect']
                },
                {
                    property: '_ValidTo',
                    operator: '=',
                    value : "9999-01-01T00:00:00Z"
                }
            ]
        });        

    },
    
    _onDefectData : function(store, data, success) {
        var that = this;
        console.log("Defects:",data.length);

        // group the defect data by the iteration the defect was created during        
        var groupedByIteration = _.groupBy( data , function (defect) {
            // find the iteration the defect was created in
            var it = _.find( that.iterations, function (i) {
                return that._dateIn( defect.get("CreationDate"), i);
            });
            var name = _.isUndefined(it) ? "None" : that._getIterationName(it);
            return name;
        });
        
        // set of iteration labels, and add "None" for defects created outside of any iteration
        var ilabels = _.pluck( that.iterations, function (i) { return that._getIterationName(i); });
        ilabels.push("None");
        
        // set of environment labels
        var elabels = _.uniq(_.pluck( data, function (d) { return d.get("Environment"); }));

        // create an array of items by first grouping defects by the iteration and then the environment
        var items = [];
        _.each(elabels, function(l) { items.push({env:l});});
        _.each( _.keys( groupedByIteration ), function(key) {
            var envs = _.groupBy( groupedByIteration[key], function(g) { return g.get("Environment");});
            // for each environment, store the value in the correct item
            _.each( _.keys(envs), function(envkey) { 
                var item = _.find(items, function(i) { return i.env == envkey;});
                item[key] = envs[envkey].length;
            });
        });

        // the set of fields in the table
        var fields = ["env"].concat(ilabels); 

        // a store from the array of items
        var store = Ext.create('Ext.data.Store', {
            fields: fields,
            data : items
        });

        // set of table columns
        var cols = _.map( ["env"].concat(ilabels) , function(f) { 
            return { text: f,  dataIndex: f, flex : 1 };
        });

        // create the grid
        var grid = Ext.create('Ext.grid.Panel', {
            title: 'Defect Leakage',
            store: store,
            columns: cols
        });
        
        // add it to the app
        this.add(grid);
    },

    // returns true if the passed date string is in the iteration date range    
    _dateIn : function ( ds, i ) {
        var d = new Date( Date.parse(ds));
        var b = new Date( Date.parse(i.get("StartDate")));
        var e = new Date( Date.parse(i.get("EndDate")));
        return (( d >= b) && ( d <= e ));
    },
    
    // replace . in iteration name with _
    _getIterationName : function(i) {
        return i.get("Name").replace(/\./g, "_");
    }
 
});
